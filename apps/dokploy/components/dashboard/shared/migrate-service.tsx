import { ArrowRightLeft, ServerIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { DrawerLogs } from "@/components/shared/drawer-logs";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";
import { type LogLine, parseLogs } from "../docker/logs/utils";

const LOCAL_TARGET = "local";

type MigratableServiceType =
	| "application"
	| "compose"
	| "postgres"
	| "mysql"
	| "mariadb"
	| "mongo"
	| "redis"
	| "libsql";

interface Props {
	serviceId: string;
	serviceName: string;
	serviceType: MigratableServiceType;
	currentServerId?: string | null;
	onSuccess?: () => unknown | Promise<unknown>;
}

export const MigrateService = ({
	serviceId,
	serviceName,
	serviceType,
	currentServerId,
	onSuccess,
}: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const [selectedTargetServerId, setSelectedTargetServerId] = useState("");
	const [isMigrating, setIsMigrating] = useState(false);
	const [isLogDrawerOpen, setIsLogDrawerOpen] = useState(false);
	const [filteredLogs, setFilteredLogs] = useState<LogLine[]>([]);
	const { data: servers } = api.server.all.useQuery(undefined, {
		enabled: isOpen,
	});

	const targetServers =
		servers?.filter(
			(server) =>
				server.serverId !== currentServerId &&
				server.serverType === "deploy" &&
				server.serverStatus === "active" &&
				!!server.sshKeyId,
		) ?? [];

	const canTargetLocal = !!currentServerId;
	const otherServersCount =
		(servers?.filter((server) => server.serverId !== currentServerId).length ??
			0) + (canTargetLocal ? 1 : 0);

	api.serviceMigration.migrateWithLogs.useSubscription(
		{
			serviceId,
			serviceType,
			targetServerId: selectedTargetServerId || LOCAL_TARGET,
		},
		{
			enabled: isMigrating && !!selectedTargetServerId,
			onData(log) {
				if (!isLogDrawerOpen) {
					setIsLogDrawerOpen(true);
				}

				if (log === "Migration finished successfully") {
					setIsMigrating(false);
					toast.success("Service migrated successfully");
					setIsOpen(false);
					void onSuccess?.();
				}

				setFilteredLogs((prev) => [...prev, ...parseLogs(log)]);
			},
			onError(error) {
				setIsMigrating(false);
				toast.error(error.message || "Service migration failed");
			},
		},
	);

	return (
		<>
			<Dialog
				open={isOpen}
				onOpenChange={(value) => {
					setIsOpen(value);
					if (!value) {
						setSelectedTargetServerId("");
						setFilteredLogs([]);
						setIsMigrating(false);
					}
				}}
			>
				<DialogTrigger asChild>
					<Button variant="outline" size="icon" className="group">
						<ArrowRightLeft className="size-3.5 text-primary" />
					</Button>
				</DialogTrigger>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>Migrate Service</DialogTitle>
						<DialogDescription>
							Migrate {serviceName} to another remote server.
						</DialogDescription>
					</DialogHeader>

					<AlertBlock type="warning">
						The service must already be stopped. Volumes are copied with rsync
						over SSH.
					</AlertBlock>

					<div className="grid gap-2">
						<span className="text-sm font-medium">Target Server</span>
						<Select
							value={selectedTargetServerId}
							onValueChange={setSelectedTargetServerId}
						>
							<SelectTrigger>
								<SelectValue placeholder="Select a target server" />
							</SelectTrigger>
							<SelectContent>
								{canTargetLocal && (
									<SelectItem value={LOCAL_TARGET}>
										<div className="flex items-center gap-2">
											<ServerIcon className="size-4" />
											<span>Dokploy server</span>
										</div>
									</SelectItem>
								)}
								{targetServers.map((server) => (
									<SelectItem key={server.serverId} value={server.serverId}>
										<div className="flex items-center gap-2">
											<ServerIcon className="size-4" />
											<span>{server.name}</span>
										</div>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						{targetServers.length === 0 && (
							<AlertBlock>
								{otherServersCount > 0
									? "No eligible target servers found. Migration only supports other active deploy servers with SSH keys configured."
									: "No other servers found in this organization."}
							</AlertBlock>
						)}
					</div>

					<DialogFooter>
						<Button
							onClick={() => {
								setFilteredLogs([]);
								setIsMigrating(true);
								setIsLogDrawerOpen(true);
							}}
							disabled={!selectedTargetServerId || isMigrating}
							isLoading={isMigrating}
						>
							Start Migration
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
			<DrawerLogs
				isOpen={isLogDrawerOpen}
				onClose={() => setIsLogDrawerOpen(false)}
				filteredLogs={filteredLogs}
			/>
		</>
	);
};
