import express from 'express';
import { print } from 'pdf-to-printer';
import fs from 'fs';
import path from 'path';
import { generateReceiptPDF } from '../services/pdfService'; // You'll write this

const router = express.Router();

router.post('/print/receipt', async (req, res) => {
  try {
    const orderData = req.body; // { items, total, tableNumber, etc. }

    // 1. Generate the PDF receipt (using PDFKit or jsPDF on the server)
    const pdfBuffer = await generateReceiptPDF(orderData);
    
    // 2. Save temp file
    const tempPath = path.join(__dirname, '../../uploads', `receipt-${Date.now()}.pdf`);
    fs.writeFileSync(tempPath, pdfBuffer);

    // 3. Send directly to the DEFAULT printer (SILENT)
    await print(tempPath); 

    // 4. Clean up
    fs.unlinkSync(tempPath);

    res.status(200).json({ message: 'Receipt sent to printer!' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Print failed' });
  }
});

export default router;