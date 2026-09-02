const CHIP_API_BASE = "https://gate.chip-in.asia/api/v1";

export type ChipPurchaseParams = {
  apiKey: string;
  brandId: string;
  amount: number;
  currency: string;
  productName: string;
  clientId: string;
  reference: string;
  successRedirect: string;
  failureRedirect: string;
  cancelRedirect: string;
  callbackUrl: string;
};

export type ChipPurchase = {
  id: string;
  status: string;
  checkout_url: string;
  client_id: string;
  is_recurring_token: boolean;
  recurring_token?: string;
  reference: string;
  payment?: {
    amount: number;
    currency: string;
  };
};

export type ChipClient = {
  id: string;
  email: string;
  full_name: string;
};

/**
 * Create a new CHIP purchase (checkout session) with force_recurring for tokenized billing.
 */
export async function createChipPurchase(params: ChipPurchaseParams): Promise<ChipPurchase> {
  const response = await fetch(`${CHIP_API_BASE}/purchases/`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      brand_id: params.brandId,
      client_id: params.clientId,
      purchase: {
        products: [{
          name: params.productName,
          price: params.amount,
          quantity: 1,
        }],
        currency: params.currency,
        language: "en",
      },
      reference: params.reference,
      force_recurring: true,
      success_redirect: params.successRedirect,
      failure_redirect: params.failureRedirect,
      cancel_redirect: params.cancelRedirect,
      success_callback: params.callbackUrl,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`CHIP create purchase failed: ${response.status} ${error}`);
  }

  return response.json() as Promise<ChipPurchase>;
}

/**
 * Charge a recurring token by creating a new purchase and charging it.
 */
export async function chargeWithToken(
  apiKey: string,
  brandId: string,
  recurringToken: string,
  amount: number,
  currency: string,
  productName: string,
  clientId: string,
  reference: string,
  callbackUrl: string,
): Promise<ChipPurchase> {
  // Create a new purchase
  const purchase = await createChipPurchaseForRenewal({
    apiKey,
    brandId,
    amount,
    currency,
    productName,
    clientId,
    reference,
    callbackUrl,
  });

  // Charge using the recurring token
  const chargeResponse = await fetch(`${CHIP_API_BASE}/purchases/${purchase.id}/charge/`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      recurring_token: recurringToken,
    }),
  });

  if (!chargeResponse.ok) {
    const error = await chargeResponse.text();
    throw new Error(`CHIP charge failed: ${chargeResponse.status} ${error}`);
  }

  return chargeResponse.json() as Promise<ChipPurchase>;
}

type RenewalPurchaseParams = {
  apiKey: string;
  brandId: string;
  amount: number;
  currency: string;
  productName: string;
  clientId: string;
  reference: string;
  callbackUrl: string;
};

async function createChipPurchaseForRenewal(params: RenewalPurchaseParams): Promise<ChipPurchase> {
  const response = await fetch(`${CHIP_API_BASE}/purchases/`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      brand_id: params.brandId,
      client_id: params.clientId,
      purchase: {
        products: [{
          name: params.productName,
          price: params.amount,
          quantity: 1,
        }],
        currency: params.currency,
        language: "en",
      },
      reference: params.reference,
      success_callback: params.callbackUrl,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`CHIP create renewal purchase failed: ${response.status} ${error}`);
  }

  return response.json() as Promise<ChipPurchase>;
}

/**
 * Get a CHIP purchase by ID.
 */
export async function getChipPurchase(apiKey: string, purchaseId: string): Promise<ChipPurchase> {
  const response = await fetch(`${CHIP_API_BASE}/purchases/${purchaseId}/`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`CHIP get purchase failed: ${response.status} ${error}`);
  }

  return response.json() as Promise<ChipPurchase>;
}

/**
 * Create a CHIP client (customer record).
 */
export async function createChipClient(
  apiKey: string,
  email: string,
  fullName: string,
): Promise<ChipClient> {
  const response = await fetch(`${CHIP_API_BASE}/clients/`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      full_name: fullName,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`CHIP create client failed: ${response.status} ${error}`);
  }

  return response.json() as Promise<ChipClient>;
}

/**
 * Get the CHIP public key for webhook signature verification.
 */
export async function getChipPublicKey(apiKey: string): Promise<string> {
  const response = await fetch(`${CHIP_API_BASE}/public_key/`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`CHIP get public key failed: ${response.status} ${error}`);
  }

  let text = await response.text();
  // CHIP API may return the PEM as a JSON string (wrapped in quotes with \n escapes)
  if (text.startsWith("\"") || text.startsWith("'")) {
    try {
      text = JSON.parse(text) as string;
    }
    catch {
      // Strip surrounding quotes and unescape \n manually
      text = text.slice(1, -1).replace(/\\n/g, "\n");
    }
  }
  return text;
}

/**
 * Decode base64 to Uint8Array without using atob().
 * Handles standard and URL-safe base64 variants.
 */
function base64ToBytes(input: string): Uint8Array {
  const cleaned = input.replace(/\s/g, "").replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  const len = cleaned.length;
  const rem = len % 4;
  const outputLen = Math.floor(len / 4) * 3 + (rem >= 2 ? rem - 1 : 0);

  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const result = new Uint8Array(outputLen);

  let pos = 0;
  for (let i = 0; i < len; i += 4) {
    const a = i < len ? chars.indexOf(cleaned[i]) : 0;
    const b = i + 1 < len ? chars.indexOf(cleaned[i + 1]) : 0;
    const c = i + 2 < len ? chars.indexOf(cleaned[i + 2]) : 0;
    const d = i + 3 < len ? chars.indexOf(cleaned[i + 3]) : 0;
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    result[pos++] = (n >> 16) & 0xFF;
    if (pos < outputLen)
      result[pos++] = (n >> 8) & 0xFF;
    if (pos < outputLen)
      result[pos++] = n & 0xFF;
  }

  return result;
}

/**
 * Verify CHIP webhook signature using RSA PKCS#1 v1.5 SHA-256 via Web Crypto API.
 */
export async function verifyChipSignature(
  publicKeyPem: string,
  payload: string,
  signatureBase64: string,
): Promise<boolean> {
  // Parse PEM to DER
  const pemContents = publicKeyPem
    .replace(/-----BEGIN PUBLIC KEY-----/g, "")
    .replace(/-----END PUBLIC KEY-----/g, "")
    .replace(/\s/g, "");
  const binaryDer = base64ToBytes(pemContents);

  // Import the public key
  const key = await crypto.subtle.importKey(
    "spki",
    new Uint8Array(binaryDer).buffer as ArrayBuffer,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["verify"],
  );

  // Decode signature from base64
  const signatureBytes = base64ToBytes(signatureBase64);

  // Encode payload to bytes
  const payloadBytes = new TextEncoder().encode(payload);

  // Verify
  return crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    signatureBytes.buffer as ArrayBuffer,
    payloadBytes.buffer as ArrayBuffer,
  );
}
