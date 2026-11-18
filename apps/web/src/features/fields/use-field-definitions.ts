import type { FieldDefinition, FieldObject, FieldsListResponse } from '@toobler-one/shared';
import { useApiResource } from '../../api/useApiResource';

/** The business's live custom fields of one object. While they load, or if they cannot be loaded, the list is empty, so a form just has no extra boxes. */
export function useFieldDefinitions(object: FieldObject): FieldDefinition[] {
  const resource = useApiResource<FieldsListResponse>(`/fields?object=${object}`);
  return resource.state.status === 'ready' ? resource.state.data.items : [];
}
