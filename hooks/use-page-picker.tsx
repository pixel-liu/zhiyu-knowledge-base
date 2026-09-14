import { create } from "zustand";

type OnSelect = (documentId: string) => void;

type PagePickerStore = {
  isOpen: boolean;
  onSelect?: OnSelect;
  // Opens the picker; `cb` receives the chosen document id.
  open: (cb: OnSelect) => void;
  close: () => void;
};

export const usePagePicker = create<PagePickerStore>((set) => ({
  isOpen: false,
  onSelect: undefined,
  open: (cb) => set({ isOpen: true, onSelect: cb }),
  close: () => set({ isOpen: false, onSelect: undefined }),
}));
