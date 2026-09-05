// src/Ticket.tsx
const Ticket = () => {
  return (
    <div style={{ 
      padding: '10px', 
      fontFamily: 'monospace', 
      width: '300px', 
      border: '1px solid #ccc' 
    }}>
      <h2 style={{ textAlign: 'center', margin: '0' }}>MY RESTAURANT</h2>
      <p style={{ textAlign: 'center', margin: '5px 0' }}>Table: 5</p>
      <hr />
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>2x Burger</span>
        <span>$10.00</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>1x Fries</span>
        <span>$05.00</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>1x Cola</span>
        <span>$03.00</span>
      </div>
      <hr />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
        <span>TOTAL</span>
        <span>$18.00</span>
      </div>
      <p style={{ textAlign: 'center', fontSize: '12px' }}>Thank you!</p>
    </div>
  );
};

export default Ticket;