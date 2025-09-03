import { create } from "zustand";

type State = {
  count: number;
  inc: () => void;
};

export const useStore = create<State>((set) => ({
  count: 0,
  inc: () => set((s: State) => ({ count: s.count + 1 })),
}));
