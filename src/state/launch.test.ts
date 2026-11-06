import { describe, expect, it } from 'vitest';
import { displayName } from './launch';

describe('displayName', () => {
  it('shows first initial + last name from a Hawk-Eye email', () => {
    expect(displayName('matthew.gaydon@hawkeyeinnovations.com')).toBe('MGaydon');
    expect(displayName('Jane.DOE@hawkeyeinnovations.com')).toBe('JDoe');
  });
  it('drops middle names and keeps hyphenated surnames', () => {
    expect(displayName('mary.ann.smith-jones@hawkeyeinnovations.com')).toBe('MSmith-Jones');
  });
  it('shows anything else as entered', () => {
    expect(displayName('operator1@hawkeyeinnovations.com')).toBe('operator1');
    expect(displayName('Test Operator')).toBe('Test Operator');
  });
});
