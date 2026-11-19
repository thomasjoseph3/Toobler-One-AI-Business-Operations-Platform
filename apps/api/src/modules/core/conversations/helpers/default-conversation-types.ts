import type { ConversationAlert, ConversationOutcome, ConversationPlaybook } from '@toobler-one/shared';

// The conversation types a business starts with (docs/CONVERSATION-TYPES.md). Pure data: no database.

/** One type to give a business. Ticket fields are present only when the outcome is a ticket. */
export interface DefaultConversationType {
  key: string;
  label: string;
  description: string;
  examples: string[];
  outcome: ConversationOutcome;
  ticketType?: 'callback' | 'question' | 'complaint' | 'existing_customer' | 'other';
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  needsPerson: boolean;
  alert: ConversationAlert | null;
  playbook: ConversationPlaybook;
}

/** The types every business gets. They can be renamed and re-routed, never removed. In the order shown. */
export const SYSTEM_CONVERSATION_TYPES: readonly DefaultConversationType[] = [
  {
    key: 'new_enquiry',
    label: 'New enquiry',
    description: 'Wants to buy, book, or know a price or availability.',
    examples: ['Do you have a room free on 20 December?', 'What is the price for a family of four?'],
    outcome: 'lead',
    needsPerson: false,
    // The hot-lead alert depends on the lead's score (F10, F23), so no fixed alert is stored here
    alert: null,
    playbook: 'sales',
  },
  {
    key: 'general_question',
    label: 'General question',
    description: 'Asks something such as opening hours, location or parking, with no sign of wanting to buy yet.',
    examples: ['What time do you open?', 'Is there parking?'],
    // A cold lead by default; a business that finds this noisy changes it to "log only"
    outcome: 'lead',
    needsPerson: false,
    alert: null,
    playbook: 'sales',
  },
  {
    key: 'existing_customer',
    label: 'Existing customer',
    description: 'About something they already bought or booked: a change, its status, documents or an invoice.',
    examples: ['Can I change my booking to Friday?', 'I need the invoice for my last stay.'],
    outcome: 'ticket',
    ticketType: 'existing_customer',
    priority: 'normal',
    needsPerson: false,
    alert: { who: 'service_team', when: 'office_hours' },
    playbook: 'service',
  },
  {
    key: 'complaint',
    label: 'Complaint',
    description: 'Unhappy about something that happened: the service, a staff member, a charge or a delay.',
    examples: ['The AC in room 204 did not work all night.', 'I was charged twice.'],
    outcome: 'ticket',
    ticketType: 'complaint',
    priority: 'high',
    needsPerson: true,
    alert: { who: 'manager', when: 'now' },
    playbook: 'service',
  },
  {
    key: 'callback_request',
    label: 'Callback request',
    description: 'Only wants someone to call them back, without saying why.',
    examples: ['Please ask someone to call me.', 'Call me back when you are free.'],
    outcome: 'ticket',
    ticketType: 'callback',
    priority: 'normal',
    needsPerson: true,
    alert: { who: 'alert_number', when: 'office_hours' },
    playbook: 'service',
  },
  {
    key: 'vendor_or_partner',
    label: 'Supplier or partner',
    description: 'A supplier, agent, partner or media person, or someone selling to the business.',
    examples: ['We supply fresh vegetables at wholesale prices.'],
    outcome: 'log',
    needsPerson: false,
    alert: null,
    playbook: 'brief_end',
  },
  {
    key: 'job_seeker',
    label: 'Job seeker',
    description: 'Asking for work or sending a CV.',
    examples: ['Are you hiring a receptionist?'],
    outcome: 'log',
    needsPerson: false,
    alert: null,
    playbook: 'brief_end',
  },
  {
    key: 'spam',
    label: 'Spam',
    description: 'Spam, scams, robocalls or abuse.',
    examples: ['You have won a prize, click this link.'],
    outcome: 'filter',
    needsPerson: false,
    alert: null,
    playbook: 'brief_end',
  },
  {
    key: 'wrong_number',
    label: 'Wrong number',
    description: 'Meant to reach someone else.',
    examples: ['Is this the pharmacy? Sorry, wrong number.'],
    outcome: 'filter',
    needsPerson: false,
    alert: null,
    playbook: 'brief_end',
  },
  {
    key: 'no_conversation',
    label: 'No conversation',
    description: 'A silent or very short call, or an empty chat. Decided by code, not by the AI.',
    examples: [],
    outcome: 'filter',
    needsPerson: false,
    alert: null,
    playbook: 'brief_end',
  },
  {
    key: 'automated',
    label: 'Automated message',
    description: 'Newsletters, receipts, one-time codes and auto-replies. Decided by code where possible.',
    examples: [],
    outcome: 'ignore',
    needsPerson: false,
    alert: null,
    playbook: 'brief_end',
  },
  {
    key: 'internal',
    label: 'Our own team',
    description: "The business's own staff numbers or emails. Decided by code.",
    examples: [],
    outcome: 'log',
    needsPerson: false,
    alert: null,
    playbook: 'brief_end',
  },
  {
    key: 'unclear',
    label: 'Unclear',
    description: 'Not enough to tell, or the AI was not sure. A person looks at it.',
    examples: [],
    outcome: 'review',
    needsPerson: true,
    alert: { who: 'alert_number', when: 'office_hours' },
    playbook: 'brief_end',
  },
];

/** The extra types an industry starts with, by industry id (the ones in the design document). Other industries get none. */
export const INDUSTRY_CONVERSATION_TYPES: Readonly<Record<string, readonly DefaultConversationType[]>> = {
  hotel_resort: [
    {
      key: 'in_house_guest_request',
      label: 'In-house guest request',
      description: 'A guest staying now asks for something: towels, room service, a repair.',
      examples: ['Please send two extra towels to room 204.'],
      outcome: 'ticket',
      ticketType: 'other',
      priority: 'urgent',
      needsPerson: true,
      alert: { who: 'front_desk', when: 'now' },
      playbook: 'service',
    },
    {
      key: 'lost_and_found',
      label: 'Lost and found',
      description: 'Someone lost something at the property, or found something.',
      examples: ['I left my charger in the room.'],
      outcome: 'ticket',
      ticketType: 'other',
      priority: 'normal',
      needsPerson: false,
      alert: null,
      playbook: 'service',
    },
    {
      key: 'event_or_group_enquiry',
      label: 'Event or group enquiry',
      description: 'Wants to book for a wedding, event or a large group.',
      examples: ['We are 40 people for a wedding in February.'],
      outcome: 'lead',
      needsPerson: false,
      alert: null,
      playbook: 'sales',
    },
  ],
  clinic: [
    {
      key: 'appointment_change',
      label: 'Appointment change',
      description: 'An existing patient wants to move or cancel an appointment.',
      examples: ['Can I move my appointment to next week?'],
      outcome: 'ticket',
      ticketType: 'existing_customer',
      priority: 'normal',
      needsPerson: false,
      alert: null,
      playbook: 'service',
    },
    {
      key: 'report_or_prescription',
      label: 'Report or prescription',
      description: 'Asks about a test report or a prescription.',
      examples: ['Is my blood test report ready?'],
      outcome: 'ticket',
      ticketType: 'question',
      priority: 'normal',
      needsPerson: false,
      alert: null,
      playbook: 'service',
    },
    {
      key: 'emergency',
      label: 'Emergency',
      description: 'A medical emergency. The agent gives the emergency number and a person is alerted at once.',
      examples: ['My father has chest pain.'],
      outcome: 'ticket',
      ticketType: 'other',
      priority: 'urgent',
      needsPerson: true,
      alert: { who: 'doctor_on_call', when: 'now' },
      playbook: 'emergency',
    },
  ],
  car_dealer: [
    {
      key: 'test_drive',
      label: 'Test drive',
      description: 'Wants to book a test drive.',
      examples: ['Can I test drive the SUV on Saturday?'],
      outcome: 'lead',
      needsPerson: false,
      alert: null,
      playbook: 'sales',
    },
    {
      key: 'service_booking',
      label: 'Service booking',
      description: 'Wants to book a service or a repair for their vehicle.',
      examples: ['I need to book my car for a service.'],
      outcome: 'lead',
      needsPerson: false,
      alert: null,
      playbook: 'service',
    },
    {
      key: 'insurance_claim',
      label: 'Insurance claim',
      description: 'Asks about an insurance claim for their vehicle.',
      examples: ['I had an accident and need help with a claim.'],
      outcome: 'ticket',
      ticketType: 'other',
      priority: 'high',
      needsPerson: true,
      alert: null,
      playbook: 'service',
    },
  ],
  education: [
    {
      key: 'admission_enquiry',
      label: 'Admission enquiry',
      description: 'Wants to know about joining: courses, fees for a new student, dates.',
      examples: ['What is the admission process for class 6?'],
      outcome: 'lead',
      needsPerson: false,
      alert: null,
      playbook: 'sales',
    },
    {
      key: 'fee_or_parent_query',
      label: 'Fee or parent query',
      description: 'A parent or current student asks about fees, timetables or progress.',
      examples: ['When is the next fee instalment due?'],
      outcome: 'ticket',
      ticketType: 'existing_customer',
      priority: 'normal',
      needsPerson: false,
      alert: null,
      playbook: 'service',
    },
  ],
  travel_agent: [
    {
      key: 'visa_or_document_help',
      label: 'Visa or document help',
      description: 'Wants help with a visa, passport or travel documents.',
      examples: ['Can you arrange a Schengen visa for us?'],
      outcome: 'lead',
      needsPerson: false,
      alert: null,
      playbook: 'sales',
    },
    {
      key: 'trip_change',
      label: 'Trip change',
      description: 'A customer with a booked trip wants to change or cancel it.',
      examples: ['We need to move our Goa trip by two days.'],
      outcome: 'ticket',
      ticketType: 'existing_customer',
      priority: 'normal',
      needsPerson: false,
      alert: null,
      playbook: 'service',
    },
  ],
  real_estate: [
    {
      key: 'site_visit',
      label: 'Site visit',
      description: 'Wants to visit a property.',
      examples: ['Can we see the 3 BHK this Sunday?'],
      outcome: 'lead',
      needsPerson: false,
      alert: null,
      playbook: 'sales',
    },
    {
      key: 'tenant_or_maintenance',
      label: 'Tenant or maintenance',
      description: 'A tenant or owner reports a repair or asks about their rental.',
      examples: ['The kitchen tap is leaking.'],
      outcome: 'ticket',
      ticketType: 'other',
      priority: 'normal',
      needsPerson: false,
      alert: null,
      playbook: 'service',
    },
  ],
};

/** The full list a business starts with, in order: the system types, then its industry's extras (none for an industry without any). */
export function listStartingConversationTypes(industryId: string): DefaultConversationType[] {
  return [...SYSTEM_CONVERSATION_TYPES, ...(INDUSTRY_CONVERSATION_TYPES[industryId] ?? [])];
}

/** Makes a key from a label: "Wedding enquiry!" becomes "wedding_enquiry". Lower case, digits and underscores; starts with a letter. */
export function makeTypeKeyFromLabel(label: string): string {
  const lowered = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const startsWithLetter = /^[a-z]/.test(lowered) ? lowered : `type_${lowered}`;
  return startsWithLetter.slice(0, 60).replace(/_+$/g, '') || 'type';
}
