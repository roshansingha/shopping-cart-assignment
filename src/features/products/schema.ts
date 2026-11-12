import { z } from "zod";
import { toCents } from "@/shared/money";

/** API data is untrusted: validate every field, convert price to integer cents. */
export const productSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1),
  price: z.number().nonnegative().finite().transform(toCents),
  description: z.string(),
  category: z.string().min(1),
  image: z.url(),
  rating: z.object({
    rate: z.number().min(0).max(5),
    count: z.number().int().nonnegative(),
  }),
});

export const productsSchema = z.array(productSchema);

/** After parsing, `price` is integer cents (the raw API sends decimal dollars). */
export type Product = z.output<typeof productSchema>;
