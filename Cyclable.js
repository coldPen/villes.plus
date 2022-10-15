import { MapContainer } from 'react-leaflet/MapContainer'
import { TileLayer } from 'react-leaflet/TileLayer'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import distance from '@turf/distance'
import center from '@turf/center'
import point from 'turf-point'

const createTurfPointCollection = (points) => ({
	type: 'FeatureCollection',
	features: points.map((p) => ({
		type: 'Feature',
		properties: {},
		geometry: {
			type: 'Point',
			coordinates: [p.lon, p.lat],
		},
	})),
})

const MapTilerKey = '1H6fEpmHR9xGnAYjulX3'

const defaultCenter = [48.10999850495452, -1.679193852233965]
const request = (name) => `

[out:json][timeout:25];
( area[name="${name}"]; )->.searchArea;
(
  node["amenity"="townhall"](area.searchArea);
  way["amenity"="townhall"](area.searchArea);

   	
 
);
// print results
out body;
>;
out skel qt;
`
const OverpassInstance = 'https://overpass-api.de/api/interpreter'

export default () => {
	const { ville } = useParams()

	const [couple, setCouple] = useState({ from: null, to: null })
	const [rawData, setData] = useState(null) // use an empty array as initial value
	const [clickedSegment, setClickedSegment] = useState()
	const [rides, setRides] = useState([])
	const [points, setPoints] = useState([])

	useEffect(() => {
		if (!(couple.to && couple.from)) return undefined
		computeBikeDistance(couple.from, couple.to).then((res) => {
			setData(res) // set the state
		})
	}, [couple])

	useEffect(() => {
		if (!ville) return
		const myRequest = `${OverpassInstance}?data=${request(ville)}`

		fetch(encodeURI(myRequest))
			.then((res) => {
				if (!res.ok) {
					throw res
				}
				return res.json()
			})
			.then((json) => {
				console.log('json', json)

				const points = json.elements
					.filter(
						(element) => element.tags && element.tags['amenity'] === 'townhall'
					)
					.map((element) => {
						if (element.type === 'way') {
							const firstNode = json.elements.find(
								(node) => node.id === element.nodes[0]
							)
							return { ...element, lat: firstNode.lat, lon: firstNode.lon }
						}
						return element
					})
					.slice(0, 10)

				console.log({ points })
				setPoints(points)
				points.map((p, i) => {
					const point1 = point([p.lon, p.lat])

					return points.map((p2, j) => {
						const point2 = point([p2.lon, p2.lat]),
							myDistance = distance(point1, point2)
						return (
							p2 !== p &&
							myDistance < 10 && //TODO important parameter, document it
							setTimeout(
								() =>
									computeBikeDistance([p.lat, p.lon], [p2.lat, p2.lon]).then(
										(res) => setRides((rides) => [...rides, res])
									),
								100 * (i + j)
							)
						)
					})
				})
			})
			.catch((error) => console.log('erreur dans la requête OSM', error))
	}, [])

	const pointsCenter = useMemo(() => {
		if (!points.length) return
		const pointCollection = createTurfPointCollection(points)
		console.log({ pointCollection })
		return center(pointCollection)
	}, [points])

	const data = rawData && segmentGeoJSON(rawData)

	const safePercentage =
		rides.length > 0 &&
		computeSafePercentage(rides.map((ride) => getMessages(ride)).flat())

	const segments = rides
		.map((ride) => segmentGeoJSON(ride))
		.map((r) => r.features)
		.flat()
	console.log('segments', segments, segments.length)
	return (
		<div
			css={`
				max-width: 1000px;
				margin: 0 auto;
			`}
		>
			<h1>Ma ville est-elle cyclable ?</h1>
			<p>
				Précisons : <em>vraiment</em> cyclable, donc avec des pistes cyclables
				séparées ou des voies où le vélo est prioritaire sur les voitures.{' '}
			</p>
			<p>Pour le découvrir, cliquez 2 points sur la carte, on vous le dira. </p>
			<p>Puis recommencez :)</p>
			{safePercentage && (
				<p>
					Ce trajet est <strong>sécurisé à {safePercentage}%</strong>.
				</p>
			)}
			{clickedSegment && JSON.stringify(clickedSegment)}
			<div css="height: 600px; width: 900px; > div {height: 100%; width: 100%}">
				<MapContainer
					center={
						(pointsCenter && pointsCenter.geometry.coordinates.reverse()) ||
						defaultCenter
					}
					zoom={13}
				>
					<TileLayer
						attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors; MapTiler'
						url={`https://api.maptiler.com/maps/toner/{z}/{x}/{y}.png?key=${MapTilerKey}`}
					/>
				</MapContainer>
			</div>

			{/*
				<Map
					provider={provider}
					height={'800px'}
					width={'800px'}
					defaultZoom={11}
					onClick={({ event, latLng, pixel }) => {
						setCouple(
							!couple.from
								? { from: latLng }
								: couple.to
								? { from: latLng }
								: { ...couple, to: latLng }
						)
					}}
				>
					{couple.from && <Marker width={50} anchor={couple.from} />}
					{couple.to && <Marker width={50} anchor={couple.to} />}
					<GeoJson>
						{rides.length > 0 &&
							rides
								.filter(Boolean)
								.map((ride) => segmentGeoJSON(ride))

								.map((r) => r.features)
								.flat()
								.map((feature) => (
									<GeoJsonFeature
										feature={feature}
										styleCallback={myStyleCallback}
									/>
								))}
						{data && (
							<GeoJsonFeature
								onClick={({ event, anchor, payload }) => {
									setClickedSegment(payload.properties)
								}}
								feature={data}
								styleCallback={myStyleCallback}
							/>
						)}
					</GeoJson>
					{points.map(({ lon, lat }) => (
						<Overlay anchor={[lat, lon]} offset={[15, 15]}>
							<img
								src="https://openmoji.org/data/color/svg/E209.svg"
								width={30}
								height={30}
								alt=""
							/>
						</Overlay>
					))}
				</Map>
	*/}
		</div>
	)
}

const myStyleCallback = (feature, hover) => {
	return feature.properties
}

const isSafePath = (tags) =>
	tags.includes('highway=living_street') || tags.includes('highway=cycleway')

const computeBikeDistance = (from, to) =>
	fetch(
		`https://brouter.de/brouter?lonlats=${from.reverse().join(',')}|${to
			.reverse()
			.join(',')}&profile=safety&alternativeidx=0&format=geojson`
	)
		.then((res) => res.json())
		.catch((e) => console.log(e))

const getMessages = (geojson) => {
	const [_, ...table] = geojson.features[0].properties.messages

	return table
}
const computeSafePercentage = (messages) => {
	const [safeDistance, total] = messages.reduce(
		(memo, next) => {
			const safe = isSafePath(next[9]),
				distance = next[3]
			return [memo[0] + (safe ? +distance : 0), memo[1] + +distance]
		},
		[0, 0]
	)

	return Math.round((safeDistance / total) * 100)
}
const segmentGeoJSON = (geojson) => {
	const table = getMessages(geojson)
	const coordinateStringToNumber = (string) => +string / 10e5
	const getLineCoordinates = (line) =>
			line && [line[0], line[1]].map(coordinateStringToNumber),
		getLineDistance = (line) => line[3],
		getLineTags = (line) => line[9]

	return {
		type: 'FeatureCollection',
		features: table
			.slice(0, -1)
			.map((line, i) => {
				// What a mess, this is hacky
				// TODO : the "messages" table contains way less segments than the LineString. They are grouped. We should reconstruct them as Brouter Web does
				const lineBis = table[i + 1]
				if (!lineBis) return

				return {
					type: 'Feature',
					properties: {
						tags: getLineTags(lineBis),
						distance: lineBis[3],
						elevation: lineBis[2],
						strokeWidth: '4px',
						stroke: isSafePath(getLineTags(lineBis)) ? 'blue' : 'red',
					},
					geometry: {
						type: 'LineString',
						coordinates: [
							getLineCoordinates(line),
							getLineCoordinates(table[i + 1]),
						],
					},
				}
			})
			.filter(Boolean),
	}
}
