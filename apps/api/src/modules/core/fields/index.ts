// The public face of the fields module: the only file other modules may import from it.
// The contacts, companies and leads modules check, merge and show the custom answers they save through these.
export {
  checkCustomAnswers,
  findFieldDefinitions,
  findMissingRequiredLeadFields,
  hideRemovedFieldAnswers,
  mergeCustomAnswers,
  sameCustomAnswers,
} from './services/custom-answers.service';
