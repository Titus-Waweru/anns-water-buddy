# M-PESA Callback Function

This Edge Function handles M-PESA STK Push callbacks and persists transaction data to the database.

## Setup

### 1. Deploy the Migration

Run the migration to create the `mpesa_transactions` table:

```bash
supabase migration up
```

Or apply it manually via the Supabase dashboard.

### 2. Environment Variables

Ensure these are set in your Supabase project:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (for server-side operations)

### 3. Deploy the Function

Deploy the function using Supabase CLI:

```bash
supabase functions deploy mpesa-callback
```

### 4. Configure M-PESA Webhook

In your M-PESA integration/dashboard, set the callback URL to:

```
https://<your-project-id>.functions.supabase.co/functions/v1/mpesa-callback
```

## Function Behavior

### Input
The function expects POST requests with M-PESA callback JSON:

```json
{
  "Body": {
    "stkCallback": {
      "MerchantRequestID": "123456",
      "CheckoutRequestID": "ws_CO_123456",
      "ResultCode": 0,
      "ResultDesc": "The service request has been processed successfully.",
      "CallbackMetadata": {
        "Item": [
          { "Name": "Amount", "Value": 1000 },
          { "Name": "MpesaReceiptNumber", "Value": "LGR61ALPHA1" },
          { "Name": "PhoneNumber", "Value": "254712345678" },
          { "Name": "TransactionDate", "Value": "20260411123045" }
        ]
      }
    }
  }
}
```

### Processing

1. **Receives** the M-PESA callback payload
2. **Extracts** stkCallback and CallbackMetadata fields
3. **Parses** the TransactionDate (format: YYYYMMDDHHmmss)
4. **Saves** the transaction to `mpesa_transactions` table
5. **Returns** HTTP 200 OK immediately (to prevent retries)

### Error Handling

- Missing fields are logged but don't cause failures
- Database errors are caught and logged
- **Always returns HTTP 200** to acknowledge receipt and prevent M-PESA retries
- All errors and missing data are logged to console for debugging

## Database Schema

The `mpesa_transactions` table stores:

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key |
| amount | numeric | Transaction amount |
| mpesa_receipt_number | text | M-PESA receipt (unique) |
| phone_number | text | Customer phone number |
| transaction_date | timestamp | Transaction timestamp |
| result_code | integer | M-PESA result code (0 = success) |
| result_description | text | M-PESA result description |
| merchant_request_id | text | Merchant request ID |
| checkout_request_id | text | Checkout request ID |
| raw_callback_data | jsonb | Complete callback payload |
| created_at | timestamp | Record creation time |
| updated_at | timestamp | Record update time |

### Indexes

- `phone_number` - For querying by customer
- `mpesa_receipt_number` - For transaction lookups
- `transaction_date` - For date range queries
- `created_at` - For recent transactions

## Security

- **RLS (Row Level Security)** is enabled
- Authenticated users can **SELECT** (read)
- Service role can **INSERT, UPDATE** (for the function)
- Uses service role key for secure database writes
- CORS headers configured for M-PESA webhook origin

## Monitoring

Check logs in Supabase dashboard:
- **Functions** → **mpesa-callback** → **Logs**

Look for:
- Successful inserts: `Successfully saved transaction`
- Missing fields: `Missing required callback fields`
- Database errors: `Database insert error`

## Testing

Use curl to test locally:

```bash
curl -X POST https://<project-id>.functions.supabase.co/functions/v1/mpesa-callback \
  -H "Content-Type: application/json" \
  -d '{
    "Body": {
      "stkCallback": {
        "MerchantRequestID": "test-123",
        "CheckoutRequestID": "test-456",
        "ResultCode": 0,
        "ResultDesc": "The service request has been processed successfully.",
        "CallbackMetadata": {
          "Item": [
            {"Name": "Amount", "Value": 1000},
            {"Name": "MpesaReceiptNumber", "Value": "TEST123ABC"},
            {"Name": "PhoneNumber", "Value": "254712345678"},
            {"Name": "TransactionDate", "Value": "20260411123045"}
          ]
        }
      }
    }
  }'
```

Expected response:
```json
{ "success": true }
```
