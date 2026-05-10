import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

const VALID_ENVS: Record<string, string> = {
  sandbox: PlaidEnvironments.sandbox,
  development: "https://development.plaid.com",
  production: PlaidEnvironments.production,
};

let _client: PlaidApi | null = null;

function createPlaidClient(): PlaidApi {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  const env = process.env.PLAID_ENV ?? "sandbox";

  if (!clientId) {
    throw new Error("PLAID_CLIENT_ID environment variable is required");
  }
  if (!secret) {
    throw new Error("PLAID_SECRET environment variable is required");
  }

  const basePath = VALID_ENVS[env];
  if (!basePath) {
    throw new Error(
      `PLAID_ENV must be one of: sandbox, development, production (got "${env}")`
    );
  }

  const configuration = new Configuration({
    basePath,
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": clientId,
        "PLAID-SECRET": secret,
      },
    },
  });

  return new PlaidApi(configuration);
}

export function getPlaidClient(): PlaidApi {
  if (!_client) {
    _client = createPlaidClient();
  }
  return _client;
}

export function resetPlaidClient(): void {
  _client = null;
}
