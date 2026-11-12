/** Raw API shape (price in dollars). 10 products, 2 categories: 2 pages at PAGE_SIZE 8. */
export const rawProducts = Array.from({ length: 10 }, (_, i) => {
  const id = i + 1;
  return {
    id,
    title: `Product ${id}`,
    price: id === 1 ? 109.95 : id * 10,
    description: `Description ${id}`,
    category: id <= 6 ? "gadgets" : "clothing",
    image: "https://fakestoreapi.com/img/81fPKd-2AYL._AC_SL1500_.jpg",
    rating: { rate: 1 + (id % 5), count: 10 * id },
  };
});
