export type SectionExam = {
  Days: string;
  Time: string;
  Location: string;
  Type: "midterm" | "final";
};

export type Section = {
  Days: string;
  Time: string;
  Location: string;
  /** Class Planner section identifier. */
  SectionId?: string;
  /** Term-qualified Class Planner section reference. */
  SectionRef?: string;
  /** Class Planner display code for the section. */
  SectionCode?: string;
  /** TSS event packages that contain this section. */
  EventPackageIds?: string[];
  /** Exams belonging to this section, included only when the section is selected. */
  Exams?: SectionExam[];
};
