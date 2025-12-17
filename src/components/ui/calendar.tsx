"use client"

import * as React from "react"
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react"
import { DayButton, DayPicker, getDefaultClassNames, type DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button, buttonVariants } from "@/components/ui/button"

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "dropdown",
  buttonVariant = "ghost",
  formatters = {},
  components,
  ...props
}: React.ComponentProps<typeof DayPicker> & {
  buttonVariant?: React.ComponentProps<typeof Button>["variant"]
}) {
  const defaultClassNames = getDefaultClassNames()

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      fromYear={2000}
      toYear={2030}
      className={cn(
        "group/calendar [--cell-size:2.5rem]",
        String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
        String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
        className
      )}
      captionLayout={captionLayout}
      formatters={{
        formatMonthDropdown: (date) =>
          date.toLocaleString("default", { month: "long" }),
        ...formatters,
      }}
      classNames={{
        root: cn("w-fit", defaultClassNames.root),
        months: cn(
          "flex !flex-row !flex-nowrap gap-6", // Force row and add gap
          defaultClassNames.months
        ),
        month: cn("space-y-4", defaultClassNames.month),
        nav: cn(
          "absolute inset-x-0 top-0 z-10 flex w-full items-center justify-between gap-1 px-1 pointer-events-none",
          defaultClassNames.nav
        ),
        button_previous: cn(
          buttonVariants({ variant: buttonVariant }),
          "pointer-events-auto h-8 w-8 select-none p-0 aria-disabled:opacity-50 text-foreground hover:bg-secondary/80 focus:bg-secondary/80",
          defaultClassNames.button_previous
        ),
        button_next: cn(
          buttonVariants({ variant: buttonVariant }),
          "pointer-events-auto h-8 w-8 select-none p-0 aria-disabled:opacity-50 text-foreground hover:bg-secondary/80 focus:bg-secondary/80",
          defaultClassNames.button_next
        ),
        month_caption: cn(
          "flex h-9 w-full items-center justify-center px-8 relative",
          defaultClassNames.month_caption
        ),
        dropdowns: cn(
          "flex items-center justify-center gap-2 text-sm font-medium z-20",
          defaultClassNames.dropdowns
        ),
        dropdown_root: cn(
          "relative inline-flex items-center",
          defaultClassNames.dropdown_root
        ),
        dropdown: cn(
          "appearance-none absolute inset-0 w-full h-full opacity-0 hover:cursor-pointer z-10",
          defaultClassNames.dropdown
        ),
        caption_label: cn(
          "hidden", // Hide the default label when using dropdowns
          defaultClassNames.caption_label
        ),
        table: "w-full border-collapse",
        weekdays: cn("flex mb-2", defaultClassNames.weekdays),
        weekday: cn(
          "text-muted-foreground w-[--cell-size] select-none text-[0.8rem] font-medium uppercase tracking-wider text-center",
          defaultClassNames.weekday
        ),
        week: cn("flex w-full mt-1", defaultClassNames.week),
        week_number_header: cn(
          "w-[--cell-size] select-none",
          defaultClassNames.week_number_header
        ),
        week_number: cn(
          "text-muted-foreground select-none text-[0.8rem]",
          defaultClassNames.week_number
        ),
        day: cn(
          "group/day relative w-[--cell-size] h-[--cell-size] p-0 text-center text-sm focus-within:relative focus-within:z-20",
          defaultClassNames.day
        ),
        range_start: cn(
          "bg-primary text-primary-foreground rounded-l-md data-[selected=true]:bg-primary data-[selected=true]:text-primary-foreground",
          defaultClassNames.range_start
        ),
        range_middle: cn(
          "bg-primary/10 text-primary data-[selected=true]:bg-primary/10 data-[selected=true]:text-primary",
          defaultClassNames.range_middle
        ),
        range_end: cn(
          "bg-primary text-primary-foreground rounded-r-md data-[selected=true]:bg-primary data-[selected=true]:text-primary-foreground",
          defaultClassNames.range_end
        ),
        selected: cn(
          "bg-primary text-primary-foreground hover:bg-primary/90 focus:bg-primary/90",
          defaultClassNames.selected
        ),
        today: cn(
          "bg-accent/10 text-accent font-semibold",
          defaultClassNames.today
        ),
        outside: cn(
          "text-muted-foreground/30 opacity-50 aria-selected:bg-primary/5 aria-selected:text-muted-foreground aria-selected:opacity-30",
          defaultClassNames.outside
        ),
        disabled: cn(
          "text-muted-foreground opacity-50",
          defaultClassNames.disabled
        ),
        hidden: cn("invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className, rootRef, ...props }) => {
          return (
            <div
              data-slot="calendar"
              ref={rootRef}
              className={cn(className)}
              {...props}
            />
          )
        },
        Chevron: ({ className, orientation, ...props }) => {
          if (orientation === "left") {
            return (
              <ChevronLeftIcon className={cn("size-4", className)} {...props} />
            )
          }

          if (orientation === "right") {
            return (
              <ChevronRightIcon
                className={cn("size-4", className)}
                {...props}
              />
            )
          }

          return (
            <ChevronDownIcon className={cn("size-4 ml-1 text-muted-foreground", className)} {...props} />
          )
        },
        DayButton: CalendarDayButton,
        WeekNumber: ({ children, ...props }) => {
          return (
            <td {...props}>
              <div className="flex size-[--cell-size] items-center justify-center text-center">
                {children}
              </div>
            </td>
          )
        },
        // Custom formatting for the dropdown-trigger look
        Dropdown: (props: any) => {
          const { options, value, onChange, caption, className, style, classNames, ...otherProps } = props;
          const selectedOption = options?.find((option: any) => option.value === value);

          return (
            <div className="relative flex items-center bg-secondary hover:bg-secondary/80 rounded-md px-3 py-1.5 transition-colors cursor-pointer border border-border shadow-sm">
              <span className="text-sm font-medium text-foreground">{selectedOption?.label ?? caption ?? value}</span>
              <ChevronDownIcon className="size-3.5 ml-2 text-muted-foreground opacity-70" />
              <select
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 appearance-none"
                value={value}
                onChange={onChange}
                style={style}
                {...otherProps}
              >
                {options?.map((option: any) => (
                  <option
                    key={option.value}
                    value={option.value}
                    disabled={option.disabled}
                    className="bg-card text-foreground"
                  >
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          )
        },
        ...components,
      }}
      {...props}
    />
  )
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const defaultClassNames = getDefaultClassNames()

  const ref = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus()
  }, [modifiers.focused])

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      data-day={day.date.toLocaleDateString()}
      data-selected-single={
        modifiers.selected &&
        !modifiers.range_start &&
        !modifiers.range_end &&
        !modifiers.range_middle
      }
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      className={cn(
        "h-full w-full p-0 font-normal aria-selected:opacity-100",
        // Single selection
        "data-[selected-single=true]:bg-accent data-[selected-single=true]:text-white data-[selected-single=true]:hover:bg-accent/90 data-[selected-single=true]:rounded-md",
        // Range Middle
        "data-[range-middle=true]:bg-accent/10 data-[range-middle=true]:text-accent data-[range-middle=true]:hover:bg-accent/20 data-[range-middle=true]:rounded-none",
        // Range Start
        "data-[range-start=true]:bg-accent data-[range-start=true]:text-white data-[range-start=true]:hover:bg-accent/90 data-[range-start=true]:rounded-l-md data-[range-start=true]:rounded-r-none",
        // Range End
        "data-[range-end=true]:bg-accent data-[range-end=true]:text-white data-[range-end=true]:hover:bg-accent/90 data-[range-end=true]:rounded-r-md data-[range-end=true]:rounded-l-none",

        "hover:bg-secondary/50",

        defaultClassNames.day,
        className
      )}
      {...props}
    />
  )
}

export { Calendar, CalendarDayButton, type DateRange }
