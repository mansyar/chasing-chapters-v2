import * as migration_20251204_082129_add_commenters_and_update_comments from './20251204_082129_add_commenters_and_update_comments';
import * as migration_20251206_170543 from './20251206_170543';
import * as migration_20251206_191512 from './20251206_191512';
import * as migration_20251214_135240 from './20251214_135240';
import * as migration_20251217_095543_add_blur_data_url_to_media from './20251217_095543_add_blur_data_url_to_media';
import * as migration_20261008_015213_payload_390_schema_delta from './20261008_015213_payload_390_schema_delta';
import * as migration_20261008_060518_add_translation_status_fields from './20261008_060518_add_translation_status_fields';
import * as migration_20261008_131000_commenters_email_hash_fix from './20261008_131000_commenters_email_hash_fix';

export const migrations = [
  {
    up: migration_20251204_082129_add_commenters_and_update_comments.up,
    down: migration_20251204_082129_add_commenters_and_update_comments.down,
    name: '20251204_082129_add_commenters_and_update_comments',
  },
  {
    up: migration_20251206_170543.up,
    down: migration_20251206_170543.down,
    name: '20251206_170543',
  },
  {
    up: migration_20251206_191512.up,
    down: migration_20251206_191512.down,
    name: '20251206_191512',
  },
  {
    up: migration_20251214_135240.up,
    down: migration_20251214_135240.down,
    name: '20251214_135240',
  },
  {
    up: migration_20251217_095543_add_blur_data_url_to_media.up,
    down: migration_20251217_095543_add_blur_data_url_to_media.down,
    name: '20251217_095543_add_blur_data_url_to_media',
  },
  {
    up: migration_20261008_015213_payload_390_schema_delta.up,
    down: migration_20261008_015213_payload_390_schema_delta.down,
    name: '20261008_015213_payload_390_schema_delta',
  },
  {
    up: migration_20261008_060518_add_translation_status_fields.up,
    down: migration_20261008_060518_add_translation_status_fields.down,
    name: '20261008_060518_add_translation_status_fields',
  },
  {
    up: migration_20261008_131000_commenters_email_hash_fix.up,
    down: migration_20261008_131000_commenters_email_hash_fix.down,
    name: '20261008_131000_commenters_email_hash_fix'
  },
];
