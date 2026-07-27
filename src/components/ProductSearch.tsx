import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
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

interface Product {
  id: string;
  name: string;
  bottle_size?: string;
  quantity: number;
}

interface ProductSearchProps {
  products: Product[];
  value: string;
  onChange: (productId: string) => void;
  disabled?: boolean;
}

export default function ProductSearch({ products, value, onChange, disabled }: ProductSearchProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = products.find((p) => p.id === value);

  const filtered = products.filter((p) => {
    if (!search) return true;
    const term = search.toLowerCase();
    const text = `${p.name} ${p.bottle_size || ""}`.toLowerCase();
    return text.includes(term);
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
          disabled={disabled}
        >
          {selected ? (
            <span className="truncate">
              {selected.name} ({selected.bottle_size}) — {selected.quantity} in stock
            </span>
          ) : (
            <span className="text-muted-foreground">Search product...</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command shouldFilter={false} className="overflow-visible h-auto">
          <CommandInput 
            placeholder="Type to search..." 
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>No product found.</CommandEmpty>
            <CommandGroup>
              {filtered.map((product) => (
                <CommandItem
                  key={product.id}
                  value={product.id}
                  onSelect={() => {
                    onChange(product.id);
                    setSearch("");
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === product.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="truncate">
                    {product.name} ({product.bottle_size || "N/A"})
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    Stock: {product.quantity}
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