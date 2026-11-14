import profilesJson from "@/data/profiles.json";
import peersJson from "@/data/peers.json";
import type { Peers, Profile } from "./types";

export const profiles = profilesJson as unknown as Profile[];
export const peers = peersJson as Peers;

export const getProfile = (id: string) => profiles.find((p) => p.id === id);
