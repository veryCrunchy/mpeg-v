// Takes an array of items and chunk items into a matrix.
// Useful for offset based pagination.
export function chunk<T>(items: T[], chunk: number): T[][] {
  // Initialize the matrix
  const chunks: T[][] = [];

  // For loop; Loop until i is more than our items available; Increment by the given chunk;
  // Each iteraction copy push targeted chunk from the passed items to the chunks array
  for (let i = 0; i < items.length; i += chunk) {
    chunks.push(items.slice(i, i + chunk));
  }

  return chunks;
}

export function duration(duration: number, useMilli = false) {
  let remain = duration;
  const days = Math.floor(remain / (1000 * 60 * 60 * 24));
  remain = remain % (1000 * 60 * 60 * 24);
  const hours = Math.floor(remain / (1000 * 60 * 60));
  remain = remain % (1000 * 60 * 60);
  const minutes = Math.floor(remain / (1000 * 60));
  remain = remain % (1000 * 60);
  const seconds = Math.floor(remain / 1000);
  remain = remain % 1000;
  const milliseconds = remain;
  const time = {
    days,
    hours,
    minutes,
    seconds,
    milliseconds,
  };
  let parts: string[] = [];
  if (time.days) {
    let ret = time.days + " Day";
    if (time.days !== 1) {
      ret += "s";
    }
    parts.push(ret);
  }
  if (time.hours) {
    let ret = time.hours + " Hr";
    if (time.hours !== 1) {
      ret += "s";
    }
    parts.push(ret);
  }
  if (time.minutes) {
    let ret = time.minutes + " Min";
    if (time.minutes !== 1) {
      ret += "s";
    }
    parts.push(ret);
  }
  if (time.seconds) {
    let ret = time.seconds + " Sec";
    if (time.seconds !== 1) {
      ret += "s";
    }
    parts.push(ret);
  }
  if (useMilli && time.milliseconds) {
    const ret = time.milliseconds + " ms";
    parts.push(ret);
  }
  if (parts.length === 0) {
    return ["just now"];
  } else {
    return parts;
  }
}
