// The public face of the WhatsApp module: the only file other modules may import from it. Nothing uses the module from outside yet
// (F23's staff alerts will send through it when they are built).
export { isWithinReplyWindow, toWhatsAppText } from './helpers/whatsapp-text';
