import type { FbKitchenTicketModel } from "@/lib/hms/load-fb-print";
import { courseLabel } from "@/lib/hms/fb-course-rules";
import { PrintTime } from "@/components/hms/fb/print/FbPrintFrame";

/** What the kitchen has been asked to make, in big type, grouped by course. */
export function FbKitchenTicket({ model }: { model: FbKitchenTicketModel }) {
  const { ticket } = model;
  const courses = [...new Set(ticket.items.map((i) => i.course))];
  return (
    <div className="text-[14px]">
      <div className="flex items-baseline justify-between">
        <span className="text-[20px] font-bold">{ticket.table_label}</span>
        {ticket.rush ? <span className="border border-black px-1 font-bold">RUSH</span> : null}
      </div>
      <p className="font-bold">#{ticket.order_number}</p>
      <p className="text-[12px]">
        {ticket.sent_to_kitchen_at ? <PrintTime iso={ticket.sent_to_kitchen_at} /> : null}
      </p>
      <div className="my-1.5 border-t-2 border-black" />
      {ticket.items.length === 0 ? <p>Nothing fired yet.</p> : null}
      {courses.map((course) => (
        <div key={course} className="mb-2">
          {courses.length > 1 || ticket.held.length ? (
            <p className="mb-0.5 text-[12px] font-bold uppercase">{courseLabel(course)}</p>
          ) : null}
          {ticket.items
            .filter((i) => i.course === course)
            .map((item) => (
              <div key={item.id} className="mb-1.5">
                <p className="text-[16px] font-bold">
                  {item.quantity} × {item.name}
                  {item.seat ? <span className="text-[12px] font-normal"> (seat {item.seat})</span> : null}
                </p>
                {item.modifiers.map((m) => (
                  <p key={m} className="pl-3">
                    &gt; {m}
                  </p>
                ))}
                {item.notes ? <p className="pl-3 font-bold">!! {item.notes}</p> : null}
              </div>
            ))}
        </div>
      ))}
      {ticket.held.length ? (
        <>
          <div className="my-1.5 border-t border-dashed border-black" />
          <p className="text-[12px]">Held: {ticket.held.map((h) => `${h.label} (${h.count})`).join(", ")}</p>
        </>
      ) : null}
    </div>
  );
}
