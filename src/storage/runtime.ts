import * as SQLite from 'expo-sqlite';
import { ContentRepository } from './contentRepository';
import { PlayerRepository } from './playerRepository';
import { CONTENT_DATABASE_NAME } from './contentManifest';
import { installMainlineContent } from '../ui/mainlineContent';
import { installSideContent } from '../ui/solidSideContent';
import { installInternalContent } from '../ui/content';
import { INTERNAL_TOOLS } from '../ui/buildConfig';
import app from '../../app.json';

let player: PlayerRepository | null = null;
let initialization: Promise<void> | null = null;
export function getPlayer(): PlayerRepository {
  if (!player) throw new Error('Storage not ready');
  return player;
}
export function initializeStorage(): Promise<void> {
  if (initialization) return initialization;
  initialization = (async () => {
    // Metro resolves database files as bundled assets.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    await SQLite.importDatabaseFromAssetAsync(CONTENT_DATABASE_NAME, { assetId: require('../../assets/levels/content.sqlite') });
    const contentDb = await SQLite.openDatabaseAsync(CONTENT_DATABASE_NAME);
    try {
      await contentDb.execAsync('PRAGMA query_only=ON');
      const content = await ContentRepository.open(contentDb);
      installMainlineContent(content); installSideContent(content.sides);
      if (INTERNAL_TOOLS) installInternalContent(content);
      const db = await SQLite.openDatabaseAsync('player.sqlite');
      try { player = await PlayerRepository.open(db, content.mainline, content.sides, app.expo.version); }
      catch (error) { await db.closeAsync(); throw error; }
    } catch (error) { await contentDb.closeAsync(); throw error; }
  })().catch(error => { initialization = null; throw error; });
  return initialization;
}
