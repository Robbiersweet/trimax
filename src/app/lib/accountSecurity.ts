export type PasswordValidation = {
  valid: boolean;
  issues: string[];
};

export function validateNewPassword(password: string): PasswordValidation {
  const issues = [
    password.length < 8 ? "Use at least 8 characters." : "",
    !/[A-Za-z]/.test(password) ? "Include at least one letter." : "",
    !/[0-9\W_]/.test(password)
      ? "Include at least one number or symbol."
      : "",
  ].filter(Boolean);

  return {
    valid: issues.length === 0,
    issues,
  };
}

export function isRecentLoginOrSessionError(message: string) {
  return /session|jwt|token|reauth|auth|login|sign in|expired/i.test(message);
}
