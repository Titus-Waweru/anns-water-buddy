import { useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface CustomerOption {
  id: string;
  name: string;
  phone?: string | null;
  credit_balance?: number | null;
}

interface CustomerSearchProps {
  customers: CustomerOption[];
  value: string;
  onChange: (customerId: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export default function CustomerSearch({
  customers,
  value,
  onChange,
  disabled,
  placeholder = "Walk-in customer",
}: CustomerSearchProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = customers.find((c) => c.id === value);

  const term = search.trim().toLowerCase();
  const filtered = term
    ? customers.filter((c) =>
        `${c.name} ${c.phone || ""}`.toLowerCase().includes(term)
      )
    : customers;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
          disabled={disabled}
        >
          {selected ? (
            <span className="truncate">
              {selected.name}
              {selected.phone ? ` · ${selected.phone}` : ""}
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <span className="ml-2 flex items-center gap-1 shrink-0">
            {selected && (
              <X
                className="h-4 w-4 opacity-60 hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange("");
                }}
              />
            )}
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[280px] p-0" align="start">
        <Command shouldFilter={false} className="overflow-visible h-auto">
          <CommandInput
            placeholder="Search name or phone..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>No customer found.</CommandEmpty>
            <CommandGroup>
              {filtered.slice(0, 100).map((customer) => (
                <CommandItem
                  key={customer.id}
                  value={customer.id}
                  onSelect={() => {
                    onChange(customer.id === value ? "" : customer.id);
                    setSearch("");
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 shrink-0",
                      value === customer.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="truncate">{customer.name}</span>
                  <span className="ml-auto pl-2 text-xs text-muted-foreground whitespace-nowrap">
                    {customer.phone || "No phone"}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
