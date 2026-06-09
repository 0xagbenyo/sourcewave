/** Must match **Purpose** values configured in ERPNext OTP Generation (OTP doctype / send_otp). */
export const OTP_PURPOSE_SIGN_UP = 'sign_up' as const;
export const OTP_PURPOSE_RESET_PASSWORD = 'reset_password' as const;

export type OtpPurpose = typeof OTP_PURPOSE_SIGN_UP | typeof OTP_PURPOSE_RESET_PASSWORD;
