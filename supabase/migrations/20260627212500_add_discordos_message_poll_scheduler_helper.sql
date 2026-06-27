create schema if not exists discordos_private;

create or replace function discordos_private.trigger_message_command_poll(
  base_url text,
  bearer_token text
)
returns bigint
language sql
security invoker
as $$
  select net.http_get(
    url := concat(rtrim(base_url, '/'), '/api/cron/discord-message-commands-poll'),
    headers := jsonb_build_object('authorization', concat('Bearer ', bearer_token)),
    timeout_milliseconds := 10000
  );
$$;
