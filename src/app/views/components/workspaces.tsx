import React from "react";
import { makeStyles, Theme, createStyles } from "@material-ui/core/styles";
import TreeView from "@material-ui/lab/TreeView";
import TreeItem, { TreeItemProps } from "@material-ui/lab/TreeItem";
import Typography from "@material-ui/core/Typography";
import ArrowDropDownIcon from "@material-ui/icons/ArrowDropDown";
import ArrowRightIcon from "@material-ui/icons/ArrowRight";
import SvgIcon, { SvgIconProps } from "@material-ui/core/SvgIcon";
import ControlPointTwoToneIcon from "@material-ui/icons/ControlPointTwoTone";
import IconButton from "@material-ui/core/IconButton";
import RemoveCircleTwoToneIcon from "@material-ui/icons/RemoveCircleTwoTone";
import { SlackIcon, SlackFolderIcon } from "../icons";

let vscode = null;

declare module "csstype" {
  interface Properties {
    "--tree-view-color"?: string;
    "--tree-view-bg-color"?: string;
  }
}

type StyledTreeItemProps = TreeItemProps & {
  bgColor?: string;
  color?: string;
  labelIcon?: React.ElementType<SvgIconProps>;
  labelInfo?: string;
  labelText: string;
  isWorkspace?: boolean;
  authId?: string;
};

const useTreeItemStyles = makeStyles((theme: Theme) =>
  createStyles({
    root: {
      color: theme.palette.text.secondary,
      "&:hover > $content": {
        backgroundColor: theme.palette.action.hover,
      },
      "&:focus > $content, &$selected > $content": {
        backgroundColor: "transparent",
      },
      "&:focus > $content $label, &:hover > $content $label, &$selected > $content $label": {
        backgroundColor: "transparent",
      },
      margin: 0,
    },
    content: {
      width: "100%",
      color: theme.palette.text.secondary,
      fontWeight: theme.typography.fontWeightMedium,
      "$expanded > &": {
        fontWeight: theme.typography.fontWeightRegular,
      },
    },
    expanded: {},
    selected: {},
    label: {
      fontWeight: "inherit",
      color: "inherit",
    },
    labelRoot: {
      display: "flex",
      alignItems: "center",
      padding: theme.spacing(0.5, 0),
    },
    labelIcon: {
      marginRight: theme.spacing(1),
    },
    labelText: {
      fontWeight: "inherit",
      flexGrow: 1,
    },
  })
);

// function SlackIcon(props: SvgIconProps) {
//   return (
//     <SvgIcon fontSize="default" viewBox="0 0 24 24" style={{ marginLeft: 6, marginTop: 6, padding: 0, transform: "scale(1.6)" }}>
//       <path
//         d="M8.54112 6.96866L9.05813 8.51433L7.4562 9.05009L6.93919 7.50442L8.54112 6.96866ZM9.65015 13.4969C5.52478 14.7345 3.7407 13.7755 2.50309 9.65015C1.26548 5.52478 2.22449 3.7407 6.34985 2.50309C10.4752 1.26548 12.2593 2.22449 13.4969 6.34985C14.7345 10.4752 13.7755 12.2593 9.65015 13.4969ZM11.8093 8.24109C11.7048 7.91428 11.3485 7.74283 11.0217 7.84731L10.2448 8.10715L9.72783 6.56148L10.5047 6.30164C10.8315 6.19716 11.0029 5.84088 10.8985 5.51407C10.794 5.18725 10.4377 5.01581 10.1109 5.12028L9.33405 5.38013L9.06617 4.57381C8.96169 4.24699 8.60541 4.07555 8.2786 4.18002C7.95178 4.28449 7.78034 4.64078 7.88481 4.96759L8.15269 5.77391L6.55077 6.31235L6.28288 5.50603C6.17841 5.17922 5.82213 5.00777 5.49532 5.11225C5.1685 5.21672 4.99706 5.573 5.10153 5.89982L5.36941 6.70614L4.59256 6.96598C4.26574 7.07045 4.0943 7.42674 4.19877 7.75355C4.28449 8.00268 4.52559 8.16609 4.77472 8.1768C4.88991 8.19287 4.98098 8.15001 5.7632 7.89017L6.28021 9.43584L5.50335 9.69568C5.17654 9.80016 5.00509 10.1564 5.10957 10.4833C5.19529 10.7324 5.43638 10.8958 5.68551 10.9065C5.8007 10.9226 5.89178 10.8797 6.67399 10.6199L6.94187 11.4262C7.04099 11.7155 7.36512 11.9245 7.72944 11.82C8.05625 11.7155 8.2277 11.3592 8.12323 11.0324L7.85534 10.2261L9.45727 9.68765L9.72515 10.494C9.82427 10.7833 10.1484 10.9922 10.5127 10.8878C10.8395 10.7833 11.011 10.427 10.9065 10.1002L10.6386 9.29386L11.4155 9.03402C11.7423 8.92151 11.9137 8.56523 11.8093 8.24109Z"
//         fill="url(#paint0_linear)"
//       />
//       <defs>
//         <linearGradient id="paint0_linear" x1="8" y1="2" x2="8" y2="14" gradientUnits="userSpaceOnUse">
//           <stop stop-color="#587EF7" />
//           <stop offset="1" stop-color="#A764F7" />
//         </linearGradient>
//       </defs>
//     </SvgIcon>
//   );
// }

function removeWorkspaceClickHandler(authId: string) {
  const command = {
    action: "codetime.disconnectSlackWorkspace",
    command: "command_execute",
    arguments: [authId],
  };
  vscode.postMessage(command);
}

function StyledTreeItem(props: StyledTreeItemProps) {
  const classes = useTreeItemStyles();
  const { labelText, labelIcon: LabelIcon, labelInfo, color, bgColor, isWorkspace, authId, ...other } = props;

  return (
    <TreeItem
      label={
        <div className={classes.labelRoot}>
          {LabelIcon && <LabelIcon color="inherit" className={classes.labelIcon} />}
          <Typography variant="body2" className={classes.labelText}>
            {labelText}
          </Typography>
          <Typography variant="caption" color="inherit">
            {labelInfo}
          </Typography>
          {isWorkspace && (
            <IconButton aria-label="Disconnect workspace" style={{ width: 32, height: 32 }}>
              <RemoveCircleTwoToneIcon onClick={() => removeWorkspaceClickHandler(authId)} />
            </IconButton>
          )}
        </div>
      }
      style={{
        "--tree-view-color": color,
        "--tree-view-bg-color": bgColor,
      }}
      classes={{
        root: classes.root,
        content: classes.content,
        expanded: classes.expanded,
        selected: classes.selected,
        label: classes.label,
      }}
      {...other}
    />
  );
}

const useStyles = makeStyles(
  createStyles({
    root: {
      width: "100%",
      flexGrow: 1,
    },
  })
);

export default function Workspaces(props) {
  const classes = useStyles();

  vscode = props.vscode;
  const workspaces = props.stateData?.slackWorkspaces ?? [];

  function addWorkspaceClickHandler() {
    const command = {
      action: "codetime.connectSlackWorkspace",
      command: "command_execute",
    };
    vscode.postMessage(command);
  }

  return (
    <TreeView className={classes.root} defaultCollapseIcon={<ArrowDropDownIcon />} defaultExpandIcon={<ArrowRightIcon />}>
      <StyledTreeItem nodeId="workspaces" labelText="Workspaces" key="workspaces" labelIcon={SlackFolderIcon}>
        {workspaces.map((value, index) => {
          return (
            <StyledTreeItem
              nodeId={value.team_domain}
              key={value.team_domain}
              labelText={value.team_domain}
              labelIcon={SlackIcon}
              isWorkspace={true}
              authId={value.authId}
            />
          );
        })}
        <StyledTreeItem
          onClick={addWorkspaceClickHandler}
          nodeId="add_workspace"
          key="add_workspace"
          labelText="Add workspace"
          labelIcon={ControlPointTwoToneIcon}
        />
      </StyledTreeItem>
    </TreeView>
  );
}
