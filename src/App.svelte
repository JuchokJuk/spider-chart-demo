<script>
  import Chart from "./Chart.svelte";

  let levels;

  fill();

  setInterval(() => {
    clear();
    setTimeout(() => {
      fill();
    }, 1000);
  }, 2500);

  function clear() {
    levels = [0, 0, 0, 0, 0, 0, 0, 0];
  }

  function fill() {
    levels = [
      randomIntFromInterval(0, 6),
      randomIntFromInterval(0, 6),
      randomIntFromInterval(0, 6),
      randomIntFromInterval(0, 6),
      randomIntFromInterval(0, 6),
      randomIntFromInterval(0, 6),
      randomIntFromInterval(0, 6),
      randomIntFromInterval(0, 6),
    ];
  }

  function randomIntFromInterval(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
  }
</script>

<Chart bind:levels />