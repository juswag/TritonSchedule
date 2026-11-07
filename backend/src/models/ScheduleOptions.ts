export type ScheduleMeeting = {
  day: number;
  start: number;
  end: number;
  location: string;
  type: string;
  sectionId: string;
};

export type ScheduleOption = {
  exams: { id: string; type: "midterm" | "final"; name: string; time: string; location: string }[];
  id: string;
  sections: { id: string; code: string; type: string; instructor: string }[];
  meetings: ScheduleMeeting[];
};

export type ScheduleCourse = {
  key: string;
  term: string;
  code: string;
  title: string;
  options: ScheduleOption[];
  issues: string[];
};
