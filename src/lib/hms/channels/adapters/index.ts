import type { ChannelProvider, ChannelProviderId } from "../types";
import { createChannexProvider } from "./channex";

/*
 * The one place that decides which provider is used. To switch: write a new adapter next to
 * channex.ts, add it here, and set CHANNEL_PROVIDER. Nothing else in the code names a provider.
 */

export function activeProviderId(): ChannelProviderId {
  return "channex";
}

let override: ChannelProvider | null = null;
/** Tests put a fake provider here. */
export function setProviderForTests(p: ChannelProvider | null) {
  override = p;
}

export function getProvider(id: ChannelProviderId = activeProviderId()): ChannelProvider {
  if (override) return override;
  switch (id) {
    case "channex":
      return createChannexProvider();
  }
}
