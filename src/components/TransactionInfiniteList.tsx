import React, { useMemo } from "react";
import { styled } from "@mui/material/styles";
import { get } from "lodash/fp";
import { useTheme, useMediaQuery, Divider } from "@mui/material";
import { VariableSizeList as List } from "react-window";
// import { InfiniteLoader, List, Index } from "react-virtualized";
// @ts-ignore
import InfiniteLoader from "react-window-infinite-loader";
// import "react-virtualized/styles.css"; // only needs to be imported once

import TransactionItem from "./TransactionItem";
import { TransactionResponseItem, TransactionPagination } from "../models";

const PREFIX = "TransactionInfiniteList";

const classes = {
  transactionList: `${PREFIX}-transactionList`,
};

const StyledInfiniteLoader = styled(InfiniteLoader)(({ theme }) => ({
  [`& .${classes.transactionList}`]: {
    width: "100%",
    minHeight: "80vh",
    display: "flex",
    overflow: "auto",
    flexDirection: "column",
  },
}));

export interface TransactionListProps {
  transactions: TransactionResponseItem[];
  loadNextPage: Function;
  pagination: TransactionPagination;
}

const TransactionInfiniteList: React.FC<TransactionListProps> = ({
  transactions,
  loadNextPage,
  pagination,
}) => {
  const theme = useTheme();
  const isXsBreakpoint = useMediaQuery(theme.breakpoints.down("sm"));
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const itemCount = pagination.hasNextPages ? transactions.length + 1 : transactions.length;

  const loadMoreItems = () => {
    return new Promise((resolve) => {
      return resolve(pagination.hasNextPages && loadNextPage(pagination.page + 1));
    });
  };

  const isRowLoaded = (index: number) => !pagination.hasNextPages || index < transactions.length;

  const Row = useMemo(() => {
    return function Row({ index, style }) {
      const transaction = get(index, transactions);

      if (index < transactions.length) {
        return (
          <div key={index} style={style}>
            <TransactionItem transaction={transaction} />
            <Divider variant={isMobile ? "fullWidth" : "inset"} />
          </div>
        );
      }
      return null;
    };
  }, [transactions, isMobile]);

  const removePx = (str: string) => +str.slice(0, str.length - 2);

  return (
    <StyledInfiniteLoader
      isItemLoaded={isRowLoaded}
      loadMoreItems={loadMoreItems}
      itemCount={Infinity}
      threshold={2}
    >
      {({ onItemsRendered, ref }) => (
        <div data-test="transaction-list" className={classes.transactionList}>
          <List
            itemCount={itemCount}
            ref={ref}
            onItemsRendered={onItemsRendered}
            height={isXsBreakpoint ? removePx(theme.spacing(74)) : removePx(theme.spacing(88))}
            width={isXsBreakpoint ? removePx(theme.spacing(38)) : removePx(theme.spacing(90))}
            itemSize={() =>
              isXsBreakpoint ? removePx(theme.spacing(28)) : removePx(theme.spacing(16))
            }
          >
            {Row}
          </List>
        </div>
      )}
    </StyledInfiniteLoader>
  );
};

export default TransactionInfiniteList;
