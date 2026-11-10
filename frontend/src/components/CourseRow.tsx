import { ChevronDown, Clock, Users, Plus, Check, BookOpen, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Course, DiscussionSection } from "@/data/sampleCourses";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface CourseRowProps {
  course: Course;
  isAdded: boolean;
  onAddToCalendar: (course: Course, selectedDiscussion?: DiscussionSection) => void;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function CourseRow({
  course,
  isAdded,
  onAddToCalendar,
  isOpen: isOpenProp,
  onOpenChange,
}: CourseRowProps) {
  const [isOpenState, setIsOpenState] = useState(false);
  const isOpen = isOpenProp ?? isOpenState;
  const setIsOpen = onOpenChange ?? setIsOpenState;
  const [selectedDiscussionId, setSelectedDiscussionId] = useState<string | undefined>(
    course.discussionSections?.[0]?.id
  );

  const selectedDiscussion = course.discussionSections?.find(
    (d) => d.id === selectedDiscussionId
  );

  const hasDiscussions = course.discussionSections && course.discussionSections.length > 0;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="panel overflow-hidden transition-colors duration-200 hover:border-primary/35">
        <CollapsibleTrigger asChild>
          <button className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-200 hover:bg-accent/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <div
                className="h-3 w-3 rounded-full shrink-0 ring-4 ring-background/60"
                style={{ backgroundColor: course.color }}
              />
              <span className="text-sm text-muted-foreground shrink-0 w-40 truncate">
                {course.instructor}
              </span>
              <span className="font-medium text-foreground truncate">
                {course.name}
              </span>
            </div>
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/80 shrink-0">
              RMP {course.rmpRating?.toFixed(1) ?? "N/A"}
            </span>
            <ChevronDown
              className={cn(
                "h-5 w-5 text-muted-foreground shrink-0 transition-transform ml-4",
                isOpen && "rotate-180"
              )}
            />
          </button>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <div className="border-t border-border/70 bg-muted/30 px-4 pb-4 pt-2">
            <p className="text-sm text-muted-foreground mb-4">
              {course.description}
            </p>
            
            <div className="grid gap-3 sm:grid-cols-2 mb-4">
              <div className="flex items-start gap-2">
                <BookOpen className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Rate My Professor</p>
                  <p className="text-sm text-foreground">
                    Take again {course.rmpTakeAgain ?? 0}% • Avg diff {course.rmpAvgDifficulty?.toFixed(1) ?? "N/A"}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Clock className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Lecture</p>
                  <p className="text-sm text-foreground">{course.schedule}</p>
                </div>
              </div>
              
              {hasDiscussions && (
                <div className="flex items-start gap-2">
                  <Users className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Discussion Section</p>
                    <Select value={selectedDiscussionId} onValueChange={setSelectedDiscussionId}>
                      <SelectTrigger className="h-10 w-full border-border/80 bg-background/60 text-sm">
                        <SelectValue
                          placeholder="Select a section"
                          className="block max-w-full truncate whitespace-nowrap"
                        />
                      </SelectTrigger>
                      <SelectContent className="z-50 max-w-[min(90vw,520px)] border-border/80 bg-popover/95 backdrop-blur">
                        {course.discussionSections!.map((section) => (
                          <SelectItem key={section.id} value={section.id} className="h-auto whitespace-normal py-2">
                            <div className="flex flex-col items-start gap-0.5">
                              <span className="font-medium leading-snug">{section.name}</span>
                              <span className="text-xs text-muted-foreground leading-snug whitespace-normal">
                                {section.time} • {section.location}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
              
              {course.midterm && (
                <div className="flex items-start gap-2">
                  <BookOpen className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Midterm</p>
                    <p className="text-sm text-foreground">{course.midterm}</p>
                  </div>
                </div>
              )}
              
              {course.final && (
                <div className="flex items-start gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Final</p>
                    <p className="text-sm text-foreground">{course.final}</p>
                  </div>
                </div>
              )}
            </div>
            
            <Button
              onClick={(e) => {
                e.stopPropagation();
                onAddToCalendar(course, selectedDiscussion);
              }}
              disabled={isAdded}
              size="sm"
              variant={isAdded ? "secondary" : "default"}
              className="rounded-full"
            >
              {isAdded ? (
                <>
                  <Check className="h-4 w-4" />
                  Added to Calendar
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Add to Calendar
                </>
              )}
            </Button>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
