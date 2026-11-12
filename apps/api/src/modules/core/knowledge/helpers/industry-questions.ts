import type { QuestionDefinition } from './question-types';

// The extra questions of each industry (the requirement's examples). Every key starts with the industry's id, so it can never
// clash with a general question or another industry's. None is needed to go live. Plain data.

/** A text field with a long answer, for the extra questions that are free words. */
const longText = (key: string, text: string): QuestionDefinition => ({
  key,
  section: 'extra',
  text,
  type: 'long_text',
  neededToGoLive: false,
  prefillFrom: ['website'],
});

/** A yes or no with optional words, for the extra questions like "Do you allow pets?". */
const yesNo = (key: string, text: string): QuestionDefinition => ({
  key,
  section: 'extra',
  text,
  type: 'yes_no',
  yesDetail: { kind: 'text', required: false, label: 'Anything customers should know' },
  neededToGoLive: false,
  prefillFrom: ['website'],
});

/** A list of named things with a short description, for rooms, doctors, courses, projects and so on. */
const namedList = (key: string, text: string, nameLabel: string): QuestionDefinition => ({
  key,
  section: 'extra',
  text,
  type: 'list',
  rowFields: [
    { key: 'name', label: nameLabel, kind: 'text', required: true },
    { key: 'details', label: 'Details', kind: 'long_text', required: false },
  ],
  maxRows: 30,
  neededToGoLive: false,
  prefillFrom: ['website'],
});

/**
 * The extra questions by industry id (hotel_resort, travel_agent, clinic, car_dealer, education, wedding_planner, real_estate).
 * Every id here exists in the industries table (migrations 003 and 015). An industry with no entry gets the general questions
 * only. The list is data, so adding an industry's extras later changes no other code.
 */
export const INDUSTRY_QUESTIONS: Readonly<Record<string, readonly QuestionDefinition[]>> = {
  hotel_resort: [
    longText('hotel_check_in_out_times', 'What are your check-in and check-out times?'),
    namedList('hotel_room_types', 'What room types do you have?', 'Room type'),
    {
      key: 'hotel_meal_plans',
      section: 'extra',
      text: 'Which meal plans do you offer?',
      type: 'pick_several',
      options: ['Room only', 'Breakfast included', 'Half board', 'Full board'],
      allowOther: true,
      neededToGoLive: false,
      prefillFrom: ['website'],
    },
    yesNo('hotel_pets', 'Do you allow pets?'),
    yesNo('hotel_parking', 'Do you have parking?'),
    longText('hotel_nearby_places', 'What are the nearby places guests ask about?'),
  ],
  travel_agent: [
    longText('travel_destinations', 'Which destinations do you offer?'),
    {
      key: 'travel_tour_kinds',
      section: 'extra',
      text: 'Do you run group tours, private tours, or both?',
      type: 'pick_one',
      options: ['Group tours', 'Private tours', 'Both'],
      neededToGoLive: false,
      prefillFrom: ['website'],
    },
    yesNo('travel_visa_help', 'Do you help with visas?'),
    longText('travel_pickup_points', 'Where do you pick customers up?'),
  ],
  clinic: [
    namedList('clinic_doctors', 'Which doctors do you have, and when are they in?', 'Doctor'),
    {
      key: 'clinic_consultation_fee',
      section: 'extra',
      text: 'What is the consultation fee?',
      type: 'price',
      neededToGoLive: false,
      prefillFrom: ['website'],
    },
    {
      key: 'clinic_appointment_style',
      section: 'extra',
      text: 'Do patients need an appointment, or can they walk in?',
      type: 'pick_one',
      options: ['Appointment needed', 'Walk-in', 'Both'],
      neededToGoLive: false,
      prefillFrom: ['website'],
    },
    yesNo('clinic_insurance', 'Do you accept insurance?'),
  ],
  car_dealer: [
    longText('car_brands_and_models', 'Which brands and models do you sell?'),
    yesNo('car_test_drives', 'Do you offer test drives?'),
    yesNo('car_exchange', 'Do you take old cars in exchange?'),
    longText('car_finance_options', 'What finance options do you offer?'),
  ],
  education: [
    namedList('education_courses', 'Which classes or courses do you run?', 'Course'),
    longText('education_admission_months', 'In which months do admissions open?'),
    longText('education_fee_structure', 'What is the fee structure?'),
    yesNo('education_transport', 'Do you provide transport?'),
  ],
  wedding_planner: [
    longText('wedding_services', 'Which services do you offer?'),
    longText('wedding_cities', 'Which cities do you cover?'),
    {
      key: 'wedding_guest_range',
      section: 'extra',
      text: 'What range of guest counts do you handle?',
      type: 'pick_one',
      options: ['Under 100', '100 to 300', '300 to 1,000', 'Over 1,000'],
      neededToGoLive: false,
      prefillFrom: ['website'],
    },
    longText('wedding_booking_lead_time', 'How far ahead should customers book?'),
  ],
  real_estate: [
    namedList('real_estate_projects', 'Which projects do you have?', 'Project'),
    longText('real_estate_locations', 'Which locations do you cover?'),
    {
      key: 'real_estate_property_types',
      section: 'extra',
      text: 'Which property types do you deal in?',
      type: 'pick_several',
      options: ['Apartments', 'Villas', 'Plots', 'Commercial'],
      allowOther: true,
      neededToGoLive: false,
      prefillFrom: ['website'],
    },
    longText('real_estate_price_range', 'What is your usual price range?'),
    yesNo('real_estate_site_visits', 'Do you arrange site visits?'),
  ],
};
