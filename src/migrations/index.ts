import * as migration_20251204_082129_add_commenters_and_update_comments from './20251204_082129_add_commenters_and_update_comments';

export const migrations = [
  {
    up: migration_20251204_082129_add_commenters_and_update_comments.up,
    down: migration_20251204_082129_add_commenters_and_update_comments.down,
    name: '20251204_082129_add_commenters_and_update_comments'
  },
];
