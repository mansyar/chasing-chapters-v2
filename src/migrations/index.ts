import * as migration_20251204_082129_add_commenters_and_update_comments from './20251204_082129_add_commenters_and_update_comments';
import * as migration_20251206_170543 from './20251206_170543';
import * as migration_20251206_191512 from './20251206_191512';

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
    name: '20251206_191512'
  },
];
