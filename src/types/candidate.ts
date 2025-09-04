export interface Candidate {
  id: number;
  name: string;
  barangay?: string;
  photoUrl?: string | null;
  bio?: string | null;
  featured?: boolean;
  votes?: number;
  isPeoplesChoice?: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;

  // optional display number used by UI
  number?: number;
}

export type ActiveCandidateResponse = { candidate?: Candidate };
