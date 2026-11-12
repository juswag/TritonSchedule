export type SeatSectionUpdate = Readonly<{
  section_id: string;
  capacity: number | null;
  enrolled: number | null;
  seats_available: number | null;
  waitlist_capacity: number | null;
  waitlist_enrolled: number | null;
  waitlist_available: number | null;
  status: string | null;
}>;

export type OfferingSeatRollup = Readonly<{
  section_ids: readonly string[];
  open_section_count: number;
  open_seat_count: number;
  waitlist_available_count: number;
}>;

export type SeatUpdateBatch = Readonly<{
  sections: readonly SeatSectionUpdate[];
  offerings: readonly OfferingSeatRollup[];
}>;

export type SeatApplyResult = Readonly<{
  applied: boolean;
  reason?: string;
  changed: number;
  unchanged: number;
  unknown: number;
  offeringsUpdated: number;
}>;

export type SeatPollClaim = Readonly<{
  status: "started" | "skipped";
  reason?: string;
}>;
