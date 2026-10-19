import { Context } from '@liusiqi-dev/cordis'
import { SettingsSchemaService } from '@liusiqi-dev/dsh-client-ui-settings/src/client/schema.ts'
import { createSettingsSchemaOperations } from '../src/client/schema-operations.ts'

/** Stateless schema operations used by settings-model component fixtures. */
export const settingsSchema = createSettingsSchemaOperations(new SettingsSchemaService(new Context()))
