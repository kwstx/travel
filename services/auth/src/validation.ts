export interface ValidationError {
  field: string;
  message: string;
}

export function validateEmail(email: string): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!email || typeof email !== 'string') {
    errors.push({ field: 'email', message: 'Email must be a string' });
    return errors;
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    errors.push({ field: 'email', message: 'Invalid email format' });
  }
  return errors;
}

export function validateProfile(data: any): ValidationError[] {
  const errors: ValidationError[] = [];
  if (data.email) {
    errors.push(...validateEmail(data.email));
  }
  if (data.firstName !== undefined && (typeof data.firstName !== 'string' || data.firstName.trim().length === 0)) {
    errors.push({ field: 'firstName', message: 'First name must be a non-empty string' });
  }
  if (data.lastName !== undefined && (typeof data.lastName !== 'string' || data.lastName.trim().length === 0)) {
    errors.push({ field: 'lastName', message: 'Last name must be a non-empty string' });
  }
  return errors;
}

export function validateLoyalty(data: any): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!data.airlineCode || typeof data.airlineCode !== 'string' || data.airlineCode.trim().length < 2 || data.airlineCode.trim().length > 3) {
    errors.push({ field: 'airlineCode', message: 'Airline code must be a 2 or 3-character string' });
  }
  if (!data.memberNumber || typeof data.memberNumber !== 'string' || data.memberNumber.trim().length === 0) {
    errors.push({ field: 'memberNumber', message: 'Member number must be a non-empty string' });
  }
  if (data.tierStatus !== undefined && typeof data.tierStatus !== 'string') {
    errors.push({ field: 'tierStatus', message: 'Tier status must be a string' });
  }
  return errors;
}

export function validatePreferences(data: any): ValidationError[] {
  const errors: ValidationError[] = [];
  const allowedCabin = ['ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST'];
  const allowedSeat = ['WINDOW', 'AISLE', 'NONE'];
  const allowedLayover = ['NONE', 'SHORT', 'MEDIUM', 'LONG'];

  if (data.cabinClass && !allowedCabin.includes(data.cabinClass.toUpperCase())) {
    errors.push({ field: 'cabinClass', message: `Cabin class must be one of: ${allowedCabin.join(', ')}` });
  }
  if (data.seatType && !allowedSeat.includes(data.seatType.toUpperCase())) {
    errors.push({ field: 'seatType', message: `Seat type must be one of: ${allowedSeat.join(', ')}` });
  }
  if (data.layoverTolerance && !allowedLayover.includes(data.layoverTolerance.toUpperCase())) {
    errors.push({ field: 'layoverTolerance', message: `Layover tolerance must be one of: ${allowedLayover.join(', ')}` });
  }
  if (data.sustainabilityWeighting !== undefined) {
    const val = Number(data.sustainabilityWeighting);
    if (isNaN(val) || val < 0 || val > 100) {
      errors.push({ field: 'sustainabilityWeighting', message: 'Sustainability weighting must be a number between 0 and 100' });
    }
  }
  return errors;
}

export function validateCompanion(data: any): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!data.firstName || typeof data.firstName !== 'string' || data.firstName.trim().length === 0) {
    errors.push({ field: 'firstName', message: 'First name must be a non-empty string' });
  }
  if (!data.lastName || typeof data.lastName !== 'string' || data.lastName.trim().length === 0) {
    errors.push({ field: 'lastName', message: 'Last name must be a non-empty string' });
  }
  if (data.relationship !== undefined && (typeof data.relationship !== 'string' || data.relationship.trim().length === 0)) {
    errors.push({ field: 'relationship', message: 'Relationship must be a non-empty string' });
  }
  return errors;
}

export function validateConsent(data: any): ValidationError[] {
  const errors: ValidationError[] = [];
  const allowedFlags = ['marketing', 'data_sharing', 'llm_access', 'profiling'];
  
  if (!data.permissionFlag || !allowedFlags.includes(data.permissionFlag)) {
    errors.push({ field: 'permissionFlag', message: `Permission flag must be one of: ${allowedFlags.join(', ')}` });
  }
  if (data.granted === undefined || typeof data.granted !== 'boolean') {
    errors.push({ field: 'granted', message: 'Granted must be a boolean' });
  }
  return errors;
}
