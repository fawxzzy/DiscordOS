import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createAdminClient, verifyAuth } from "npm:@supabase/server@1.4.0/core";

import {
  createDiscordUpdateDraftsHandler,
  createNamedServiceAuthenticator,
  SERVICE_IDENTITY,
} from "./handler.mjs";

const authenticate = createNamedServiceAuthenticator(verifyAuth);

const handler = createDiscordUpdateDraftsHandler({
  authenticate,
  createRpcClient: () => createAdminClient({ auth: { keyName: SERVICE_IDENTITY } }),
});

Deno.serve(handler);
