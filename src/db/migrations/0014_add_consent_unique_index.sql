CREATE UNIQUE INDEX `uq_consent_user_client` ON `oauth_consents` (`user_id`, `client_id`);
