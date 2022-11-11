import { CreateUserMap } from "util/data";
import { NO_OP, TruncateString } from "util/misc";
import { FormatTime, MillisToSince } from "util/time";
import { ONE_HOUR } from "util/constants/time";
import { ClumpActivity } from "util/activity";
import { APIFetchV1 } from "util/api";
import SessionRaiseBreakdown from "components/sessions/SessionRaiseBreakdown";
import ScoreTable from "components/tables/scores/ScoreTable";
import ApiError from "components/util/ApiError";
import Divider from "components/util/Divider";
import Icon from "components/util/Icon";
import LinkButton from "components/util/LinkButton";
import Loading from "components/util/Loading";
import Muted from "components/util/Muted";
import useApiQuery from "components/util/query/useApiQuery";
import React, { useEffect, useState } from "react";
import { Button, Col, Row } from "react-bootstrap";
import { FormatChart, UserDocument } from "tachi-common";
import { ActivityReturn, SessionReturns } from "types/api-returns";
import { ScoreDataset } from "types/tables";
import {
	ClumpedActivity,
	ClumpedActivityClassAchievement,
	ClumpedActivityScores,
	ClumpedActivitySession,
} from "types/tachi";
import ClassBadge from "components/game/ClassBadge";
import { Link } from "react-router-dom";

// Records activity for a group of users on a GPT. Also used for single users.
export default function Activity({
	url,
	handleNoActivity = (
		<Col xs={12} className="text-center">
			We found no activity!
		</Col>
	),
}: {
	url: string;
	handleNoActivity?: React.ReactNode;
}) {
	const [clumped, setClumped] = useState<ClumpedActivity>([]);
	const [users, setUsers] = useState<Array<UserDocument>>([]);

	const { data, error } = useApiQuery<ActivityReturn>(url);

	useEffect(() => {
		if (!data) {
			setClumped([]);
			setUsers([]);
		} else {
			setClumped(ClumpActivity(data));
			setUsers(data.users);
		}
	}, [data]);

	if (error) {
		return <ApiError error={error} />;
	}

	if (!data) {
		return <Loading />;
	}

	if (clumped.length === 0) {
		return <>{handleNoActivity}</>;
	}

	return (
		<ActivityInner
			data={clumped}
			users={users}
			fetchMoreFrom={(start) => {
				APIFetchV1<ActivityReturn>(`${url}?startTime=${start}`).then((r) => {
					if (r.success) {
						setUsers([...users, ...r.body.users]);
						setClumped([...clumped, ...ClumpActivity(r.body)]);
					}
				});
			}}
		/>
	);
}

function ActivityInner({
	data,
	users,
	fetchMoreFrom,
}: {
	data: ClumpedActivity;
	users: Array<UserDocument>;
	fetchMoreFrom: (start: number) => void;
}) {
	const userMap = CreateUserMap(users);

	return (
		<Col xs={12} className="text-center">
			Tip: You can click on an event to learn more about it.
			<div className="timeline timeline-2 mt-4">
				<div className="timeline-bar"></div>
				{data.map((e) => {
					const user = userMap.get(e.type === "SCORES" ? e.scores[0]?.userID : e.userID);

					if (!user) {
						return <div>This user doesn't exist? Whoops.</div>;
					}

					switch (e.type) {
						case "SCORES":
							return <ScoresActivity data={e} user={user} />;
						case "SESSION":
							return <SessionActivity data={e} user={user} />;
						case "CLASS_ACHIEVEMENT":
							return <ClassAchievementActivity data={e} user={user} />;
					}
				})}
				<div className="timeline-item">
					<div className="timeline-item">
						<div className="timeline-badge bg-success"></div>
						<div
							className="timeline-content d-flex"
							style={{
								flexDirection: "column",
								flexWrap: "wrap",
								marginRight: "2rem",
							}}
						>
							<Button
								variant="outline-primary"
								onClick={() => {
									let lastTimestamp;
									const lastThing = data.at(-1)!;

									switch (lastThing.type) {
										case "SCORES":
											lastTimestamp = lastThing.scores[0]?.timeAchieved;
											break;
										case "CLASS_ACHIEVEMENT":
											lastTimestamp = lastThing.timeAchieved;
											break;
										case "SESSION":
											lastTimestamp = lastThing.timeStarted;
									}

									if (!lastTimestamp) {
										alert("Failed. What?");
										return;
									}

									fetchMoreFrom(lastTimestamp);
								}}
							>
								Load More...
							</Button>
						</div>
					</div>
				</div>
			</div>
		</Col>
	);
}

function ScoresActivity({ data, user }: { data: ClumpedActivityScores; user: UserDocument }) {
	const { game, playtype } = data.scores[0];

	const [show, setShow] = useState(false);

	let subMessage;
	let mutedText: string | null | undefined;

	if (data.scores.length === 1) {
		const score0 = data.scores[0];

		subMessage = `a score on ${FormatChart(
			score0.game,
			score0.__related.song,
			score0.__related.chart
		)}`;

		if (score0.comment) {
			mutedText = `"${score0.comment}"`;
		}
	} else {
		subMessage = `${data.scores.length} scores`;

		mutedText = TruncateString(
			data.scores
				.map((e) => FormatChart(e.game, e.__related.song, e.__related.chart))
				.join(", "),
			100
		);
	}

	const dataset: ScoreDataset = data.scores.map((e, i) => ({
		...e,
		__related: {
			...e.__related,
			index: i,
			user,
		},
	}));

	return (
		<div className="timeline-item timeline-hover my-4">
			<div className="timeline-badge bg-warning"></div>
			<div
				className="timeline-content d-flex"
				style={{
					flexDirection: "column",
					flexWrap: "wrap",
					marginRight: "2rem",
				}}
			>
				<div
					className="d-flex align-items-center justify-content-between"
					onClick={() => setShow(!show)}
				>
					<div className="mr-3" style={{ width: "70%", textAlign: "left" }}>
						<Icon
							type={`chevron-${show ? "down" : "right"}`}
							style={{
								fontSize: "0.75rem",
							}}
						/>
						<span style={{ fontSize: "1.15rem" }} className="ml-2">
							{user.username} highlighted {subMessage}!
						</span>
						{mutedText && (
							<>
								<br />
								<Muted>{mutedText}</Muted>
							</>
						)}
					</div>

					<div style={{ textAlign: "right" }}>
						{MillisToSince(data.scores[0].timeAchieved ?? 0)}
						<br />
						<span className="text-muted font-italic text-right">
							{FormatTime(data.scores[0].timeAchieved ?? 0)}
						</span>
					</div>
				</div>

				{show && (
					<>
						<Divider />
						<ScoreTable
							noTopDisplayStr
							dataset={dataset}
							game={game}
							playtype={playtype}
						/>
					</>
				)}
			</div>
		</div>
	);
}

function SessionActivity({ data, user }: { data: ClumpedActivitySession; user: UserDocument }) {
	const [show, setShow] = useState(false);

	const isProbablyActive = Date.now() - data.timeEnded < ONE_HOUR;

	return (
		<div className="timeline-item timeline-hover">
			<div className={`timeline-badge bg-${data.highlight ? "warning" : "secondary"}`}></div>
			<div
				className="timeline-content d-flex"
				style={{
					flexDirection: "column",
					flexWrap: "wrap",
					marginRight: "2rem",
				}}
			>
				<div
					className="d-flex align-items-center justify-content-between"
					onClick={() => setShow(!show)}
				>
					<div className="mr-3" style={{ width: "70%", textAlign: "left" }}>
						<Icon
							type={`chevron-${show ? "down" : "right"}`}
							style={{
								fontSize: "0.75rem",
							}}
						/>
						<span
							className="ml-2"
							style={{
								fontWeight: isProbablyActive ? "bold" : undefined,
								fontSize: isProbablyActive ? "1.2rem" : undefined,
							}}
						>
							{user.username} {isProbablyActive ? "is having" : "had"} a session '
							{data.name}' with {data.scoreInfo.length}{" "}
							{data.scoreInfo.length === 1 ? "score" : "scores"}.
						</span>
						<br />
						{data.desc && data.desc !== "This session has no description." && (
							<span className="text-muted">{data.desc}</span>
						)}
					</div>

					<div style={{ textAlign: "right" }} className="mr-1">
						{MillisToSince(data.timeStarted ?? 0)}
						<br />
						<span className="text-muted font-italic text-right">
							{FormatTime(data.timeStarted ?? 0)}
						</span>
					</div>
				</div>
				{show && <SessionShower sessionID={data.sessionID} />}
			</div>
		</div>
	);
}

function SessionShower({ sessionID }: { sessionID: string }) {
	const { data, error } = useApiQuery<SessionReturns>(`/sessions/${sessionID}`);

	if (error) {
		return <ApiError error={error} />;
	}

	if (!data) {
		return <Loading />;
	}

	return (
		<Row>
			<SessionRaiseBreakdown sessionData={data} setScores={NO_OP} />
			<Col xs={12}>
				<Divider />
			</Col>
			<div className="d-flex w-100 justify-content-center">
				<LinkButton
					className="btn-outline-primary"
					to={`/dashboard/users/${data.user.username}/games/${data.session.game}/${data.session.playtype}/sessions/${sessionID}`}
				>
					View Full Session
				</LinkButton>
			</div>
		</Row>
	);
}

function ClassAchievementActivity({
	data,
	user,
}: {
	data: ClumpedActivityClassAchievement;
	user: UserDocument;
}) {
	return (
		<div className="timeline-item timeline-hover">
			<div className="timeline-badge bg-success"></div>
			<div
				className="timeline-content d-flex"
				style={{
					flexDirection: "column",
					flexWrap: "wrap",
					marginRight: "2rem",
				}}
			>
				<div className="d-flex align-items-center justify-content-between">
					<div className="mr-3" style={{ width: "70%", textAlign: "left" }}>
						<Link
							to={`/dashboard/users/${user.username}/games/${data.game}/${data.playtype}`}
							className="gentle-link"
						>
							{user.username}
						</Link>{" "}
						achieved{" "}
						<ClassBadge
							classSet={data.classSet}
							game={data.game}
							playtype={data.playtype}
							classValue={data.classValue}
						/>
						{data.classOldValue !== null && (
							<>
								{" "}
								(Raised from{" "}
								<ClassBadge
									classSet={data.classSet}
									game={data.game}
									playtype={data.playtype}
									classValue={data.classOldValue}
								/>
								)
							</>
						)}
					</div>

					<div style={{ textAlign: "right" }} className="mr-1">
						{MillisToSince(data.timeAchieved)}
						<br />
						<span className="text-muted font-italic text-right">
							{FormatTime(data.timeAchieved)}
						</span>
					</div>
				</div>
			</div>
		</div>
	);
}