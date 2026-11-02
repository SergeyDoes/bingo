export function countCompletedLines(gridSize: number, occurredPositions: ReadonlySet<number>): number {
  if (!Number.isInteger(gridSize) || gridSize < 1) {
    throw new RangeError('Grid size must be a positive integer.');
  }

  let completed = 0;
  const isComplete = (positions: number[]) => positions.every((position) => occurredPositions.has(position));

  for (let row = 0; row < gridSize; row += 1) {
    if (isComplete(Array.from({ length: gridSize }, (_, column) => row * gridSize + column))) completed += 1;
  }

  for (let column = 0; column < gridSize; column += 1) {
    if (isComplete(Array.from({ length: gridSize }, (_, row) => row * gridSize + column))) completed += 1;
  }

  if (isComplete(Array.from({ length: gridSize }, (_, index) => index * gridSize + index))) completed += 1;
  if (isComplete(Array.from({ length: gridSize }, (_, index) => index * gridSize + (gridSize - 1 - index)))) completed += 1;

  return completed;
}
