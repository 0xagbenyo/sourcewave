/**
 * Paystack Integration Service
 * 
 * This service handles Paystack mobile money payment integration.
 * Supports MTN Mobile Money and Vodafone Cash (Telecel) payments.
 */

import axios, { AxiosError } from 'axios';

// Paystack Configuration
const PAYSTACK_BASE_URL = 'https://api.paystack.co';
const PAYSTACK_SECRET_KEY = 'sk_test_f794b6852ccb41c223d8c73841c634f9ab752f59';
const PAYSTACK_PUBLIC_KEY = 'pk_test_d334b40c4ade19bd5a6123c720fe8b3177743ce7';

export interface PaystackChargeRequest {
  email: string;
  amount: number; // Amount in pesewas (smallest currency unit)
  currency: string; // 'GHS' for Ghana Cedis
  reference?: string; // Optional: Payment Request name from ERPNext (e.g., "PR-00047"). If not provided, Paystack generates one.
  mobile_money: {
    phone: string; // Phone number (e.g., "0551234987")
    provider: 'mtn' | 'vod'; // 'mtn' for MTN Mobile Money, 'vod' for Vodafone Cash
  };
}

export interface PaystackChargeResponse {
  status: boolean;
  message: string;
  data: {
    reference: string;
    status: string; // 'pay_offline', 'send_otp', 'success', 'pending'
    display_text?: string; // Message to show to user (for pay_offline and send_otp)
    amount?: number;
    channel?: string;
    currency?: string;
    gateway_response?: string;
    paid_at?: string;
    transaction_date?: string;
    authorization?: any;
    customer?: any;
  };
}

export interface PaystackVerifyResponse {
  status: boolean;
  message: string;
  data: {
    amount: number;
    status: string; // 'success', 'failed', 'pending'
    reference: string;
    gateway_response: string;
  };
}

/**
 * Initialize a Paystack mobile money charge
 * 
 * @param request - Charge request parameters
 * @returns Paystack charge response
 */
export const initializePaystackCharge = async (
  request: PaystackChargeRequest
): Promise<PaystackChargeResponse> => {
  try {
    const response = await axios.post<PaystackChargeResponse>(
      `${PAYSTACK_BASE_URL}/charge`,
      request,
      {
        headers: {
          'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000, // 30 seconds timeout for payment requests
      }
    );

    // Log the full response for debugging
    console.log('Paystack charge response:', JSON.stringify(response.data, null, 2));
    console.log('Paystack response status:', response.status);
    console.log('Paystack response.data.status:', response.data?.status);

    // Check if Paystack returned an error in the response body
    // Paystack can return 200 status but with status: false in the body
    // However, "Charge attempted" message with status: true is SUCCESS, not error
    if (response.data) {
      const paystackResponse = response.data;
      
      // If status is false, it's an error
      // BUT: "Charge attempted" message means success, even if status might be false
      // This is a Paystack quirk - "Charge attempted" = successful charge initiation
      if (paystackResponse.status === false) {
        const errorMessage = paystackResponse.message || 'Payment initialization failed';
        
        // Special case: "Charge attempted" is actually success, not error
        if (errorMessage === 'Charge attempted' || errorMessage.includes('Charge attempted')) {
          console.log('Paystack returned "Charge attempted" with status false - treating as success');
          // Return as success - the charge was attempted successfully
          return {
            ...paystackResponse,
            status: true, // Override status to true
          } as PaystackChargeResponse;
        }
        
        throw new Error(errorMessage);
      }
      
      // If status is true, even with "Charge attempted" message, it's success
      // "Charge attempted" means the charge was initiated successfully
      if (paystackResponse.status === true) {
        return paystackResponse;
      }
    }

    // If we get here, something unexpected happened
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError<PaystackChargeResponse | { message?: string; status?: boolean }>;
    
    // If it's already our custom error, re-throw it
    if (error instanceof Error && !axiosError.response && !axiosError.request) {
      throw error;
    }
    
    if (axiosError.response) {
      // Paystack returned a response (could be error or success)
      const responseData = axiosError.response.data;
      
      // Check if it's actually a successful response (status: true in body)
      // Even if HTTP status is not 200, Paystack might return success in body
      if (responseData && typeof responseData === 'object' && 'status' in responseData) {
        const paystackResponse = responseData as PaystackChargeResponse;
        
        // If status is true, it's a successful charge attempt (even if HTTP status is not 200)
        if (paystackResponse.status === true) {
          console.log('Paystack returned success in error handler - returning response');
          return paystackResponse;
        }
        
        // If status is false, it's an actual error
        if (paystackResponse.status === false) {
          throw new Error(paystackResponse.message || 'Payment initialization failed');
        }
      }
      
      // HTTP error response without proper Paystack format
      const errorData = responseData as { message?: string };
      const errorMessage = errorData?.message || `Paystack API error: ${axiosError.response.status}`;
      
      // Special case: "Charge attempted" is actually success, not an error
      if (errorMessage === 'Charge attempted' || errorMessage.includes('Charge attempted')) {
        console.warn('Received "Charge attempted" in error handler - treating as success');
        // Try to extract the response data if available
        if (responseData && typeof responseData === 'object') {
          return responseData as PaystackChargeResponse;
        }
      }
      
      throw new Error(errorMessage);
    } else if (axiosError.request) {
      // Request was made but no response received
      throw new Error('Network error: Unable to reach Paystack. Please check your internet connection.');
    } else {
      // Something else happened
      throw new Error(axiosError.message || 'Failed to initialize payment');
    }
  }
};

/**
 * Verify a Paystack payment transaction
 * 
 * @param reference - Payment reference (Payment Request name)
 * @returns Paystack verify response
 */
export const verifyPaystackPayment = async (
  reference: string
): Promise<PaystackVerifyResponse> => {
  try {
    const response = await axios.get<PaystackVerifyResponse>(
      `${PAYSTACK_BASE_URL}/transaction/verify/${reference}`,
      {
        headers: {
          'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>;
    
    if (axiosError.response) {
      const errorData = axiosError.response.data;
      throw new Error(
        errorData?.message || 
        `Paystack verification error: ${axiosError.response.status}`
      );
    } else if (axiosError.request) {
      throw new Error('Network error: Unable to verify payment. Please check your internet connection.');
    } else {
      throw new Error(axiosError.message || 'Failed to verify payment');
    }
  }
};

/**
 * Map app payment provider to Paystack provider format
 * 
 * @param provider - App provider ('mtn' or 'telecel')
 * @returns Paystack provider ('mtn' or 'vod')
 */
export const mapProviderToPaystack = (provider: 'mtn' | 'telecel'): 'mtn' | 'vod' => {
  return provider === 'mtn' ? 'mtn' : 'vod';
};

/**
 * Convert amount from GHS to pesewas
 * 
 * @param amountInGHS - Amount in Ghana Cedis
 * @returns Amount in pesewas (smallest currency unit)
 */
export const convertToPesewas = (amountInGHS: number): number => {
  return Math.round(amountInGHS * 100);
};

export { PAYSTACK_PUBLIC_KEY };

