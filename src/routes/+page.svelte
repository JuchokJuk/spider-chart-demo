<script lang="ts">
  import Chart from "../components/Chart.svelte";

  let levels: number[];

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

  function randomIntFromInterval(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1) + min);
  }
</script>

<Chart bind:levels />
