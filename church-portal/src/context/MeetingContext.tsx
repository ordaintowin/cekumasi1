import { createContext, useContext, useState, ReactNode } from "react";

export interface JoinedMeeting {
  id: number;
  title: string;
  myDisplayName: string;
  myRole: "admin" | "co-host" | "member" | "guest";
  meetingType?: string;
  unmutingAllowed?: boolean;
  [key: string]: any;
}

interface MeetingCtx {
  joinedMeeting: JoinedMeeting | null;
  setJoinedMeeting: (m: JoinedMeeting | null) => void;
  myPeerId: string;
}

const MeetingContext = createContext<MeetingCtx>({
  joinedMeeting: null,
  setJoinedMeeting: () => {},
  myPeerId: "",
});

export function MeetingProvider({ children }: { children: ReactNode }) {
  const [joinedMeeting, setJoinedMeeting] = useState<JoinedMeeting | null>(null);
  const [myPeerId] = useState(() => crypto.randomUUID());
  return (
    <MeetingContext.Provider value={{ joinedMeeting, setJoinedMeeting, myPeerId }}>
      {children}
    </MeetingContext.Provider>
  );
}

export function useMeetingContext() {
  return useContext(MeetingContext);
}
