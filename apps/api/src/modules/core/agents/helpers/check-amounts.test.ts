import { describe, expect, it } from 'vitest';
import { findAmountsInText, findUnbackedAmounts } from './check-amounts';

describe('findAmountsInText', () => {
  it('finds amounts written in the ways people write them in India', () => {
    expect(findAmountsInText('Rooms are from ₹4,500, or Rs. 3000, or INR 2500.')).toEqual([4500, 3000, 2500]);
    expect(findAmountsInText('It costs 1,25,000 rupees, or 800/-')).toEqual([125000, 800]);
  });

  it('keeps paise', () => {
    expect(findAmountsInText('₹4,500.50 a night')).toEqual([4500.5]);
  });

  it('ignores numbers that are not money: dates, counts, phone numbers', () => {
    expect(findAmountsInText('Check in on 5 December for 3 nights, call 9847012345')).toEqual([]);
  });
});

describe('findUnbackedAmounts (an amount no source gave)', () => {
  const toolResult = 'Deluxe room: from ₹4,000 a night plus GST.';

  it('accepts an amount a tool gave', () => {
    expect(findUnbackedAmounts('A deluxe room is from ₹4,000 a night.', [toolResult])).toEqual([]);
  });

  it('accepts an amount the customer said themselves', () => {
    expect(findUnbackedAmounts('Yes, ₹5,000 is within what we offer.', ['My budget is 5000'])).toEqual([]);
  });

  it('catches a total the AI worked out', () => {
    // 3 nights at 4000 = 12000: nobody said 12000
    expect(findUnbackedAmounts('For 3 nights that is ₹12,000.', [toolResult, 'I want 3 nights'])).toEqual([12000]);
  });

  it('catches an invented price and a made-up discount', () => {
    expect(findUnbackedAmounts('I can do ₹3,200 for you.', [toolResult])).toEqual([3200]);
  });

  it('accepts a price written differently from the source (4,000 and 4000 are the same)', () => {
    expect(findUnbackedAmounts('From Rs 4000.', [toolResult])).toEqual([]);
  });

  it('has nothing to say about an answer with no amounts', () => {
    expect(findUnbackedAmounts('Our team will call you within 15 minutes.', [])).toEqual([]);
  });
});
