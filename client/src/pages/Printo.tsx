import { useState } from 'react';
import { api } from '../api';

const PosScreen = () => {
  // 1. State to hold the ticket text returned from Fastify
  const [ticketText, setTicketText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSilentPrint = async () => {
    setLoading(true);
    try {
      // Call the API endpoint
      const response = await api.post('/silent-print');
      
      // 2. Save the ticketText from server response into state
      setTicketText(response.data.ticketText);
    } catch (err) {
      console.error("Print simulation failed:", err);
      alert("Failed to connect to print endpoint.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>Restaurant POS</h1>

      <button 
        onClick={handleSilentPrint}
        disabled={loading}
        style={{ 
          padding: '10px 20px', 
          fontSize: '16px', 
          cursor: loading ? 'not-allowed' : 'pointer',
          background: '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: '5px'
        }}
      >
        {loading ? 'Generating...' : '🖨️ Simulate & Preview Ticket'}
      </button>

      {/* 3. Render the paper preview only when ticketText is available */}
      {ticketText && (
        <div style={{ marginTop: '25px' }}>
          <h3>Receipt Preview:</h3>
          
          <div style={{
            width: '280px',
            backgroundColor: '#fffdf8',
            padding: '20px',
            borderRadius: '4px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            borderTop: '6px solid #d0d0d0',
            borderBottom: '6px dashed #aaa',
            color: '#111'
          }}>
            <pre style={{ 
              fontFamily: '"Courier New", Courier, monospace', 
              fontSize: '13px', 
              lineHeight: '1.2',
              whiteSpace: 'pre-wrap', 
              margin: 0 
            }}>
              {ticketText}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};

export default PosScreen;