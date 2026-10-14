export function validateCustomer(name, mobile) {
  const errors = {};
  if (!name.trim() || name.length > 100 || /[\x00-\x1f\x7f]/.test(name.trim())) {
    errors.customer_name = 'Enter your name (1–100 characters).';
  }
  if (!/^[0-9]{10}$/.test(mobile)) {
    errors.mobile = 'Enter exactly 10 digits, without +91 or spaces.';
  }
  return errors;
}
