export function preloadImage(url) {
    return new Promise(resolve => {
        const image = new Image();
        image.decoding = 'async';
        image.fetchPriority = 'low';
        image.onload = image.onerror = () => resolve();
        image.src = url;
    });
}
