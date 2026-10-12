-- Real upstream migrations at mixutin/dauntless-revived 2947755 (AGPL-3.0).
-- UndauntedMetagame/src/drizzle/0000_natural_korg.sql
CREATE TABLE `characters` (
	`characterId` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`createdDate` text NOT NULL,
	`lastModifiedDate` text NOT NULL,
	`name` text NOT NULL,
	`updateVersion` integer NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `inventories` (
	`characterId` text PRIMARY KEY NOT NULL,
	`instancedItems` text NOT NULL,
	`stackedItems` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`userId` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`notes` integer NOT NULL
);

-- UndauntedMetagame/src/drizzle/0001_slow_storm.sql
CREATE TABLE `loadouts` (
	`characterId` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`loadouts` text NOT NULL
);

-- UndauntedMetagame/src/drizzle/0002_gorgeous_saracen.sql
CREATE TABLE `gameserverapikeys` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`keyHash` text
);
--> statement-breakpoint
CREATE TABLE `gameserverapikeystoregister` (
	`key` text PRIMARY KEY NOT NULL
);

-- UndauntedMetagame/src/drizzle/0003_slippery_blackheart.sql
CREATE TABLE `breadcrumbs` (
	`characterId` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`breadcrumbs` text NOT NULL,
	`updateVersion` integer NOT NULL
);

-- UndauntedMetagame/src/drizzle/0004_silky_lady_mastermind.sql
ALTER TABLE `loadouts` ADD `persistent` text NOT NULL default '{}';
-- UndauntedMetagame/src/drizzle/0005_mighty_zeigeist.sql
CREATE TABLE `encounteredcontent` (
	`characterId` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`encounteredcontent` text NOT NULL
);

-- UndauntedMetagame/src/drizzle/0006_woozy_slipstream.sql
CREATE TABLE `userapikeys` (
	`userId` text PRIMARY KEY NOT NULL,
	`keyHash` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `userapikeystoregister` (
	`userId` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL
);

-- UndauntedMetagame/src/drizzle/0007_last_maximus.sql
CREATE TABLE `invitecodes` (
	`invitecode` text PRIMARY KEY NOT NULL,
	`usesRemaining` integer NOT NULL,
	`infiniteUses` boolean NOT NULL
);

-- UndauntedMetagame/src/drizzle/0008_vengeful_spirit.sql
ALTER TABLE `users` ADD `isAdmin` boolean DEFAULT false NOT NULL;
-- UndauntedMetagame/src/drizzle/0009_nice_dazzler.sql
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`userId` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`notes` integer NOT NULL,
	`isAdmin` boolean DEFAULT 0 NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_users`("userId", "name", "notes", "isAdmin") SELECT "userId", "name", "notes", "isAdmin" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
-- UndauntedMetagame/src/drizzle/0010_save_history_and_item_log.sql
CREATE TABLE `characterhistory` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`characterId` text NOT NULL,
	`userId` text NOT NULL,
	`updateVersion` integer NOT NULL,
	`name` text NOT NULL,
	`data` text NOT NULL,
	`savedDate` text NOT NULL,
	`reason` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `characterhistory_character` ON `characterhistory` (`characterId`,`id`);--> statement-breakpoint
CREATE TABLE `inventorylog` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`time` text NOT NULL,
	`userId` text NOT NULL,
	`characterId` text NOT NULL,
	`transactionId` text,
	`source` text,
	`caller` text NOT NULL,
	`operation` text NOT NULL,
	`catalogId` text,
	`instanceId` text,
	`quantityChange` integer,
	`quantityAfter` integer,
	`updateVersion` integer
);
--> statement-breakpoint
CREATE INDEX `inventorylog_character` ON `inventorylog` (`characterId`,`id`);--> statement-breakpoint
CREATE TABLE `inventorytransactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`transactionId` text NOT NULL,
	`characterId` text NOT NULL,
	`userId` text NOT NULL,
	`requestHash` text NOT NULL,
	`status` integer NOT NULL,
	`response` text NOT NULL,
	`createdDate` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inventorytransactions_character_transaction_request` ON `inventorytransactions` (`characterId`,`transactionId`,`requestHash`);--> statement-breakpoint
CREATE TABLE `loadouthistory` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`characterId` text NOT NULL,
	`userId` text NOT NULL,
	`version` integer NOT NULL,
	`loadouts` text NOT NULL,
	`persistent` text NOT NULL,
	`savedDate` text NOT NULL,
	`reason` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `loadouthistory_character` ON `loadouthistory` (`characterId`,`id`);--> statement-breakpoint
-- Hand-edited: drizzle-kit also emitted a rebuild of `users` and `invitecodes` for the
-- boolean -> integer declared-type drift left by 0009. Dropped on purpose: it rewrites
-- existing rows for no behavioural change (SQLite stores both the same way).
CREATE TRIGGER `inventorylog_no_update` BEFORE UPDATE ON `inventorylog` BEGIN SELECT RAISE(ABORT, 'inventorylog is append-only'); END;--> statement-breakpoint
CREATE TRIGGER `inventorylog_no_delete` BEFORE DELETE ON `inventorylog` BEGIN SELECT RAISE(ABORT, 'inventorylog is append-only'); END;

-- UndauntedMetagame/src/drizzle/0011_real_progression.sql
CREATE TABLE `bounties` (
	`accountId` text NOT NULL,
	`bountyId` text NOT NULL,
	`slotIndex` integer,
	`updateVersion` integer NOT NULL,
	`data` text NOT NULL,
	`updatedDate` text NOT NULL,
	PRIMARY KEY(`accountId`, `bountyId`)
);
--> statement-breakpoint
CREATE TABLE `bountydraft` (
	`accountId` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`updatedDate` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cooldowns` (
	`accountId` text NOT NULL,
	`cooldownId` text NOT NULL,
	`startedDate` text NOT NULL,
	`updatedDate` text NOT NULL,
	PRIMARY KEY(`accountId`, `cooldownId`)
);
--> statement-breakpoint
CREATE TABLE `entitlements` (
	`accountId` text NOT NULL,
	`name` text NOT NULL,
	`activatedDate` text NOT NULL,
	`duration` integer NOT NULL,
	`source` text NOT NULL,
	`grantedDate` text NOT NULL,
	`revokedDate` text,
	PRIMARY KEY(`accountId`, `name`)
);
--> statement-breakpoint
CREATE TABLE `huntpassselection` (
	`accountId` text PRIMARY KEY NOT NULL,
	`progressionId` text NOT NULL,
	`updatedDate` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `loadoutslots` (
	`characterId` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`numCharacterSlots` integer NOT NULL,
	`activeIndex` integer NOT NULL,
	`updatedDate` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `objectives` (
	`accountId` text NOT NULL,
	`objectiveId` text NOT NULL,
	`progress` integer NOT NULL,
	`completedCount` integer NOT NULL,
	`createdDate` text NOT NULL,
	`lastModifiedDate` text NOT NULL,
	PRIMARY KEY(`accountId`, `objectiveId`)
);
--> statement-breakpoint
CREATE TABLE `progression_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`time` text NOT NULL,
	`accountId` text NOT NULL,
	`caller` text NOT NULL,
	`route` text NOT NULL,
	`body` text,
	`status` integer NOT NULL,
	`reply` text,
	`note` text
);
--> statement-breakpoint
CREATE INDEX `progression_events_account` ON `progression_events` (`accountId`,`id`);--> statement-breakpoint
CREATE TABLE `progress_tracks` (
	`accountId` text NOT NULL,
	`progressionId` text NOT NULL,
	`progress` integer NOT NULL,
	`confirmedFreeRank` integer NOT NULL,
	`confirmedPremiumRank` integer NOT NULL,
	`confirmedDate` text NOT NULL,
	`updatedDate` text NOT NULL,
	PRIMARY KEY(`accountId`, `progressionId`)
);
--> statement-breakpoint
CREATE TRIGGER `progression_events_no_update` BEFORE UPDATE ON `progression_events` BEGIN SELECT RAISE(ABORT, 'progression_events is append-only'); END;--> statement-breakpoint
CREATE TRIGGER `progression_events_no_delete` BEFORE DELETE ON `progression_events` BEGIN SELECT RAISE(ABORT, 'progression_events is append-only'); END;

-- UndauntedMetagame/src/drizzle/0012_friends_and_blocks.sql
CREATE TABLE `blocks` (
	`blockerId` text NOT NULL,
	`blockedId` text NOT NULL,
	`createdAt` integer NOT NULL,
	PRIMARY KEY(`blockerId`, `blockedId`)
);
--> statement-breakpoint
CREATE INDEX `blocks_blocked` ON `blocks` (`blockedId`);--> statement-breakpoint
CREATE TABLE `friendships` (
	`userLow` text NOT NULL,
	`userHigh` text NOT NULL,
	`requesterId` text NOT NULL,
	`status` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	PRIMARY KEY(`userLow`, `userHigh`)
);
--> statement-breakpoint
CREATE INDEX `friendships_high` ON `friendships` (`userHigh`);
-- UndauntedMetagame/src/drizzle/0013_guilds.sql
CREATE TABLE `guildinvites` (
	`inviteId` text PRIMARY KEY NOT NULL,
	`guildId` text NOT NULL,
	`inviteeId` text NOT NULL,
	`inviterId` text NOT NULL,
	`createdAt` integer NOT NULL,
	`expiresAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `guildinvites_pair` ON `guildinvites` (`guildId`,`inviteeId`);--> statement-breakpoint
CREATE INDEX `guildinvites_invitee` ON `guildinvites` (`inviteeId`);--> statement-breakpoint
CREATE TABLE `guildmembers` (
	`accountId` text PRIMARY KEY NOT NULL,
	`guildId` text NOT NULL,
	`rank` text NOT NULL,
	`joinedAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `guildmembers_guild` ON `guildmembers` (`guildId`);--> statement-breakpoint
CREATE TABLE `guilds` (
	`guildId` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`nameKey` text NOT NULL,
	`nameplate` text DEFAULT '' NOT NULL,
	`nameplateKey` text,
	`leaderId` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `guilds_name_key` ON `guilds` (`nameKey`);--> statement-breakpoint
CREATE UNIQUE INDEX `guilds_nameplate_key` ON `guilds` (`nameplateKey`);
-- UndauntedMetagame/src/drizzle/0014_escalation.sql
CREATE TABLE `escalationprogression` (
	`accountId` text NOT NULL,
	`seasonId` text NOT NULL,
	`level` integer NOT NULL,
	`xp` integer NOT NULL,
	`updateVersion` integer NOT NULL,
	`contentHash` text NOT NULL,
	`updatedDate` text NOT NULL,
	PRIMARY KEY(`accountId`, `seasonId`)
);
--> statement-breakpoint
CREATE TABLE `escalationtalents` (
	`accountId` text NOT NULL,
	`seasonId` text NOT NULL,
	`talentId` text NOT NULL,
	`rank` integer NOT NULL,
	PRIMARY KEY(`accountId`, `seasonId`, `talentId`)
);
--> statement-breakpoint
CREATE TABLE `escalationunlocks` (
	`accountId` text NOT NULL,
	`seasonId` text NOT NULL,
	`unlockId` text NOT NULL,
	`collectedDate` text NOT NULL,
	PRIMARY KEY(`accountId`, `seasonId`, `unlockId`)
);

-- UndauntedMetagame/src/drizzle/0015_store_purchases.sql
CREATE TABLE `storepurchases` (
	`tokenHash` text PRIMARY KEY NOT NULL,
	`accountId` text NOT NULL,
	`characterId` text NOT NULL,
	`skuId` text NOT NULL,
	`offerHash` text NOT NULL,
	`createdDate` text NOT NULL,
	`expiresDate` text NOT NULL,
	`redeemedDate` text
);
--> statement-breakpoint
CREATE INDEX `storepurchases_account` ON `storepurchases` (`accountId`);
-- UndauntedMetagame/src/drizzle/0016_slayer_links.sql
CREATE TABLE `slayerlinkinvites` (
	`inviteId` text PRIMARY KEY NOT NULL,
	`senderId` text NOT NULL,
	`targetId` text NOT NULL,
	`senderSlot` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`expiresAt` integer NOT NULL,
	`status` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `slayerlinkinvites_sender` ON `slayerlinkinvites` (`senderId`);--> statement-breakpoint
CREATE INDEX `slayerlinkinvites_target` ON `slayerlinkinvites` (`targetId`);--> statement-breakpoint
CREATE UNIQUE INDEX `slayerlinkinvites_pending_pair` ON `slayerlinkinvites` (`senderId`,`targetId`) WHERE "status" = 'PENDING';--> statement-breakpoint
CREATE TABLE `slayerlinks` (
	`linkId` text PRIMARY KEY NOT NULL,
	`senderId` text NOT NULL,
	`targetId` text NOT NULL,
	`senderSlot` integer NOT NULL,
	`targetSlot` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`endsAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `slayerlinks_sender` ON `slayerlinks` (`senderId`);--> statement-breakpoint
CREATE INDEX `slayerlinks_target` ON `slayerlinks` (`targetId`);
-- UndauntedMetagame/src/drizzle/0017_discord_links.sql
CREATE TABLE `discordlinks` (
    `discordId` text PRIMARY KEY NOT NULL,
    `userId` text NOT NULL UNIQUE REFERENCES `users`(`userId`),
    `linkedAt` text NOT NULL
);

-- UndauntedMetagame/src/drizzle/0018_trials_leaderboards.sql
CREATE TABLE `trialruns` (
    `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    `trialId` text NOT NULL,
    `trialWeek` integer NOT NULL,
    `difficulty` integer NOT NULL,
    `mode` text NOT NULL,
    `runKey` text NOT NULL,
    `groupKey` text NOT NULL,
    `completionTime` integer NOT NULL,
    `objectivesCompleted` integer NOT NULL,
    `sessionId` text NOT NULL,
    `entries` text NOT NULL,
    `submittedDate` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trialruns_week_trial_difficulty_run` ON `trialruns` (`trialWeek`,`trialId`,`difficulty`,`runKey`);
--> statement-breakpoint
CREATE INDEX `trialruns_board` ON `trialruns` (`trialWeek`,`trialId`,`difficulty`,`mode`,`completionTime`);
--> statement-breakpoint
CREATE INDEX `trialruns_group` ON `trialruns` (`trialWeek`,`trialId`,`difficulty`,`mode`,`groupKey`);
--> statement-breakpoint
CREATE TABLE `trialweeks` (
    `week` integer PRIMARY KEY NOT NULL,
    `finalizedDate` text NOT NULL,
    `awardedAccounts` integer NOT NULL
);

-- UndauntedMetagame/src/drizzle/0019_trials_profiles.sql
CREATE TABLE `leaderboardprofiles` (
    `accountId` text PRIMARY KEY NOT NULL,
    `epicId` text NOT NULL,
    `platformId` text NOT NULL,
    `platform` text NOT NULL,
    `displayName` text NOT NULL,
    `updatedDate` text NOT NULL
);

-- UndauntedMetagame/src/drizzle/0020_hunt_regions.sql
CREATE TABLE `huntregions` (
    `userId` text PRIMARY KEY NOT NULL REFERENCES `users`(`userId`),
    `region` text NOT NULL CHECK (`region` IN ('main', 'aus'))
);

-- UndauntedMetagame/src/drizzle/0021_onetime_jobs.sql
CREATE TABLE `onetimejobs` (
    `jobId` text PRIMARY KEY NOT NULL,
    `doneDate` text NOT NULL
);

-- UndauntedMetagame/src/drizzle/0022_germany_region.sql
CREATE TABLE `huntregions_new` (
    `userId` text PRIMARY KEY NOT NULL REFERENCES `users`(`userId`),
    `region` text NOT NULL CHECK (`region` IN ('main', 'aus', 'ger'))
);
--> statement-breakpoint
INSERT INTO `huntregions_new` SELECT `userId`, `region` FROM `huntregions`;
--> statement-breakpoint
DROP TABLE `huntregions`;
--> statement-breakpoint
ALTER TABLE `huntregions_new` RENAME TO `huntregions`;

-- UndauntedMetagame/src/drizzle/0023_moderation.sql
CREATE TABLE player_addresses (account_id TEXT NOT NULL, address TEXT NOT NULL, last_seen INTEGER NOT NULL, PRIMARY KEY(account_id,address));
--> statement-breakpoint
CREATE TABLE account_bans (account_id TEXT PRIMARY KEY NOT NULL, reason TEXT NOT NULL, address TEXT, active INTEGER NOT NULL, updated_at INTEGER NOT NULL, actor TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX active_ban_address ON account_bans(address,active);
--> statement-breakpoint
CREATE TABLE moderation_events (id INTEGER PRIMARY KEY AUTOINCREMENT, account_id TEXT NOT NULL, reason TEXT NOT NULL, address TEXT, active INTEGER NOT NULL, created_at INTEGER NOT NULL, actor TEXT NOT NULL);

-- UndauntedMetagame/src/drizzle/0024_ephemeral_addresses.sql
DELETE FROM player_addresses;

-- UndauntedMetagame/src/drizzle/0025_inventory_expiry_index.sql
CREATE INDEX IF NOT EXISTS `inventorytransactions_created_date` ON `inventorytransactions` (`createdDate`);

-- UndauntedMetagame/src/drizzle/0026_account_key_recovery.sql
CREATE TABLE `accountkeyrecovery` (`userId` text PRIMARY KEY NOT NULL, `keyHash` text NOT NULL, `ciphertext` text NOT NULL);

-- UndauntedMetagame/src/drizzle/0027_player_key_rotation.sql
CREATE TABLE recoveryproofs (discordId TEXT PRIMARY KEY NOT NULL, userId TEXT NOT NULL UNIQUE, keyHash TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE recoverychallenges (tokenHash TEXT PRIMARY KEY NOT NULL, discordId TEXT NOT NULL, userId TEXT, keyHash TEXT, expiresAt INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0);
--> statement-breakpoint
CREATE TABLE authepochs (userId TEXT PRIMARY KEY NOT NULL, epoch INTEGER NOT NULL DEFAULT 0);
--> statement-breakpoint
CREATE TABLE recoveryevents (id INTEGER PRIMARY KEY AUTOINCREMENT, discordId TEXT NOT NULL, action TEXT NOT NULL, createdAt INTEGER NOT NULL);
--> statement-breakpoint
CREATE INDEX recoveryevents_actor_time ON recoveryevents(discordId,createdAt);

-- UndauntedMetagame/src/drizzle/0028_us_region.sql
CREATE TABLE `huntregions_new` (
    `userId` text PRIMARY KEY NOT NULL REFERENCES `users`(`userId`),
    `region` text NOT NULL CHECK (`region` IN ('main', 'aus', 'ger', 'us'))
);
--> statement-breakpoint
INSERT INTO `huntregions_new` SELECT `userId`, `region` FROM `huntregions`;
--> statement-breakpoint
DROP TABLE `huntregions`;
--> statement-breakpoint
ALTER TABLE `huntregions_new` RENAME TO `huntregions`;

