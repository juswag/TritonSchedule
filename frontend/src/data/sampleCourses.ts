import type { CalendarExam } from "@/types/calendar";

export interface DiscussionSection {
  id: string;
  name: string;
  time: string;
  location: string;
  /** Term-qualified Class Planner section reference. */
  sectionRef?: string;
  /** Class Planner display code for the section. */
  sectionCode?: string;
  /** TSS event packages that contain this section. */
  eventPackageIds?: string[];
  exams?: CalendarExam[];
}

export interface CourseExamSection {
  id: string;
  name: string;
  time: string;
  location: string;
}

export interface Course {
  id: string;
  name: string;
  instructor: string;
  schedule: string;
  description: string;
  color: string;
  lectureLocation?: string;
  lectureMeetings?: DiscussionSection[];
  /** Term-qualified Class Planner reference for the primary section. */
  lectureSectionRef?: string;
  /** TSS event packages that contain the primary section. */
  lectureEventPackageIds?: string[];
  sectionCode?: string;
  /** Official TSS booking URLs keyed by event package ID. */
  tssPackageUrls?: Record<string, string>;
  /** Official module-level TSS route when no package deep link exists. */
  tssFallbackUrl?: string;
  rmpRating?: number;
  rmpTakeAgain?: number;
  rmpAvgDifficulty?: number;
  rmpProfileUrl?: string;
  discussionSections?: DiscussionSection[];
  labSections?: DiscussionSection[];
  /** Complete primary-section exams; undefined for older catalog responses. */
  exams?: CalendarExam[];
  midtermSections?: CourseExamSection[];
  finalSection?: CourseExamSection | null;
  midterm?: string;
  final?: string;
}

export const sampleCourses: Course[] = [
  {
    id: "1",
    name: "Introduction to Computer Science",
    instructor: "Dr. Sarah Johnson",
    schedule: "Mon, Wed, Fri 9:00 AM - 10:30 AM",
    description: "Fundamentals of programming and computational thinking using Python.",
    color: "hsl(221, 83%, 53%)",
    rmpRating: 4.6,
    rmpTakeAgain: 92,
    rmpAvgDifficulty: 2.3,
    discussionSections: [
      { id: "1a", name: "Section A", time: "Thu 3:00 PM - 4:00 PM", location: "Room 101" },
      { id: "1b", name: "Section B", time: "Thu 4:00 PM - 5:00 PM", location: "Room 102" },
      { id: "1c", name: "Section C", time: "Fri 1:00 PM - 2:00 PM", location: "Room 103" },
    ],
    midterm: "Wed, Feb 12 @ 9:00 AM - 10:30 AM",
    final: "Mon, Mar 17 @ 8:00 AM - 11:00 AM",
  },
  {
    id: "2",
    name: "Calculus I",
    instructor: "Prof. Michael Chen",
    schedule: "Tue, Thu 11:00 AM - 12:30 PM",
    description: "Introduction to differential and integral calculus, limits, and derivatives.",
    color: "hsl(142, 71%, 45%)",
    rmpRating: 4.2,
    rmpTakeAgain: 76,
    rmpAvgDifficulty: 3.1,
    discussionSections: [
      { id: "2a", name: "Section A", time: "Wed 2:00 PM - 3:00 PM", location: "Room 205" },
      { id: "2b", name: "Section B", time: "Wed 3:00 PM - 4:00 PM", location: "Room 206" },
    ],
    midterm: "Thu, Feb 13 @ 11:00 AM - 12:30 PM",
    final: "Tue, Mar 18 @ 11:30 AM - 2:30 PM",
  },
  {
    id: "3",
    name: "English Literature",
    instructor: "Dr. Emily Rodriguez",
    schedule: "Mon, Wed 2:00 PM - 3:30 PM",
    description: "Survey of British and American literature from the Renaissance to modern day.",
    color: "hsl(262, 83%, 58%)",
    rmpRating: 4.8,
    rmpTakeAgain: 88,
    rmpAvgDifficulty: 2.0,
    discussionSections: [
      { id: "3a", name: "Section A", time: "Fri 10:00 AM - 11:00 AM", location: "Room 310" },
      { id: "3b", name: "Section B", time: "Fri 11:00 AM - 12:00 PM", location: "Room 311" },
    ],
    midterm: "Wed, Feb 19 @ 2:00 PM - 3:30 PM",
    final: "Wed, Mar 19 @ 3:00 PM - 6:00 PM",
  },
  {
    id: "4",
    name: "Physics 101",
    instructor: "Prof. James Williams",
    schedule: "Tue, Thu 9:00 AM - 10:30 AM",
    description: "Introduction to mechanics, thermodynamics, and wave phenomena.",
    color: "hsl(25, 95%, 53%)",
    rmpRating: 3.9,
    rmpTakeAgain: 64,
    rmpAvgDifficulty: 3.6,
    discussionSections: [
      { id: "4a", name: "Section A", time: "Mon 4:00 PM - 5:00 PM", location: "Lab 101" },
      { id: "4b", name: "Section B", time: "Wed 4:00 PM - 5:00 PM", location: "Lab 102" },
      { id: "4c", name: "Section C", time: "Fri 2:00 PM - 3:00 PM", location: "Lab 103" },
    ],
    midterm: "Tue, Feb 18 @ 9:00 AM - 10:30 AM",
    final: "Thu, Mar 20 @ 8:00 AM - 11:00 AM",
  },
  {
    id: "5",
    name: "Art History",
    instructor: "Dr. Lisa Thompson",
    schedule: "Fri 1:00 PM - 4:00 PM",
    description: "Exploration of visual arts from ancient civilizations to contemporary movements.",
    color: "hsl(340, 82%, 52%)",
    rmpRating: 4.4,
    rmpTakeAgain: 81,
    rmpAvgDifficulty: 2.7,
    midterm: "Fri, Feb 21 @ 1:00 PM - 2:30 PM",
    final: "Fri, Mar 21 @ 3:00 PM - 6:00 PM",
  },
  {
    id: "6",
    name: "Introduction to Psychology",
    instructor: "Dr. Robert Kim",
    schedule: "Mon, Wed, Fri 11:00 AM - 12:00 PM",
    description: "Overview of human behavior, cognition, and mental processes.",
    color: "hsl(180, 70%, 45%)",
    rmpRating: 4.1,
    rmpTakeAgain: 73,
    rmpAvgDifficulty: 3.0,
    discussionSections: [
      { id: "6a", name: "Section A", time: "Tue 1:00 PM - 2:00 PM", location: "Room 401" },
      { id: "6b", name: "Section B", time: "Tue 2:00 PM - 3:00 PM", location: "Room 402" },
    ],
    midterm: "Mon, Feb 24 @ 11:00 AM - 12:00 PM",
    final: "Mon, Mar 17 @ 11:30 AM - 2:30 PM",
  },
];
