import { Router, Request, Response } from 'express';
import multer from 'multer';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { menuItems, menuItemModifiers } from '../db/schema.js';

const router = Router();
const upload = multer({ dest: 'uploads/' });

// Helper to parse modifier IDs from body (JSON string or array)
const parseModifierIds = (raw: any): number[] => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(Number);
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(Number) : [];
  } catch {
    return [];
  }
};

// PATCH Route (Updating a Menu Item)
// 🟢 CLEAN JSON ROUTE
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const menuItemId = parseInt(req.params.id as string, 10);
    
    // 🔍 LOG THIS IN YOUR TERMINAL TO SEE EXACT KEYS
    console.log("BACKEND RECEIVED BODY:", req.body);

    // Accept both camelCase and snake_case keys
    const rawGroupIds = req.body.modifierGroupIds ?? req.body.modifier_group_ids;

    // Force parse into array of numbers
    let groupIds: number[] = [];
    if (Array.isArray(rawGroupIds)) {
      groupIds = rawGroupIds.map((id) => Number(id)).filter((n) => !isNaN(n));
    } else if (typeof rawGroupIds === 'string') {
      groupIds = rawGroupIds.split(',').map((id) => Number(id.trim())).filter((n) => !isNaN(n));
    }

    console.log("PARSED GROUP IDS:", groupIds);

    // 1. Update Menu Item core fields
    const [updatedItem] = await db
      .update(menuItems)
      .set({
        ...(req.body.name && { name: req.body.name.trim() }),
        ...(req.body.categoryId && { categoryId: Number(req.body.categoryId) }),
        ...(req.body.description !== undefined && { description: req.body.description }),
        ...(req.body.price !== undefined && { price: String(req.body.price) }),
        ...(req.body.isAvailable !== undefined && { isAvailable: Boolean(req.body.isAvailable) }),
      })
      .where(eq(menuItems.id, menuItemId))
      .returning();

    // 2. Always clear and re-insert into junction table
    await db.delete(menuItemModifiers).where(eq(menuItemModifiers.menuItemId, menuItemId));

    if (groupIds.length > 0) {
      console.log(`INSERTING ${groupIds.length} MODIFIER GROUPS...`);
      await db.insert(menuItemModifiers).values(
        groupIds.map((groupId, index) => ({
          menuItemId,
          modifierGroupId: groupId,
          sortOrder: index,
        }))
      );
    }

    return res.json({ message: 'Menu item updated successfully', menuItem: updatedItem });
  } catch (error: any) {
    console.error("PATCH ROUTE ERROR:", error);
    return res.status(500).json({ message: error.message });
  }
});

// POST Route (Creating a Menu Item)
router.post('/', upload.single('image'), async (req: Request, res: Response) => {
  try {
    const { restaurantId, categoryId, name, description, price, isAvailable, modifierGroupIds } = req.body;

    const imagePath = req.file ? `/uploads/${req.file.filename}` : null;
    const groupIds = parseModifierIds(modifierGroupIds);

    // 1. Insert Menu Item
    // 1. Insert Menu Item
    const [newItem] = await db
      .insert(menuItems)
      .values({
        restaurantId: Number(restaurantId || 1),
        categoryId: categoryId ? Number(categoryId) : null,
        
        // Contextual Names (using 'name' from req.body for all 3, or fallback to body fields)
        menuName: name.trim(),
        invoiceName: req.body.invoiceName?.trim() || name.trim(),
        kitchenName: req.body.kitchenName?.trim() || name.trim(),

        // Pricing Tiers (using 'price' from req.body or specific tier values)
        priceDineIn: String(price || '0.00'),
        priceTakeaway: req.body.priceTakeaway ? String(req.body.priceTakeaway) : String(price || '0.00'),
        priceDelivery: req.body.priceDelivery ? String(req.body.priceDelivery) : String(price || '0.00'),
        priceWaiter: req.body.priceWaiter ? String(req.body.priceWaiter) : String(price || '0.00'),

        // Details & Media
        description: description?.trim() || null,
        images: imagePath ? [imagePath] : [],
        
        // Availability & Sorting
        isAvailable: isAvailable === 'true' || isAvailable === true,
        position: req.body.position ? Number(req.body.position) : 0,
      })
      .returning();

    // 2. Link Modifiers
    if (groupIds.length > 0) {
      await db.insert(menuItemModifiers).values(
        groupIds.map((groupId, index) => ({
          menuItemId: newItem.id,
          modifierGroupId: groupId,
          sortOrder: index,
        }))
      );
    }

    res.status(201).json({ message: 'Menu item created successfully', menuItem: newItem });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

export default router;