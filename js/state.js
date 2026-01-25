export const state = {
    map: null,
    userMarker: null,
    userLocation: null,
    routingControl: null,
    stations: [],
    events: [],
    markers: [],
    isAdmin: false,
    activeStationId: null,
    activeEventId: null,
    activeTab: "map",
    favorites: new Set(),
    downloads: { flyer1: '', flyer2: '', icsDate: '' },
    config: {
        title: 'LICHTERNACHT',
        subtitle: 'Bechhofen | 22. Nov'
    },
    useLocalStorage: false,
    db: null,
    auth: null,
    appId: null,
    // Firebase functions container
    fb: {}
};
